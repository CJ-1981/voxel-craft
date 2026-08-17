// World data, terrain generation, chunk meshing, endless chunk streaming, and persistence.
//
// The world is INFINITE horizontally: terrain is stored in 16×48×16 chunks that
// stream in around the player and unload when far away. Generation is fully
// deterministic per column (seeded noise + coordinate hashes), so a chunk can be
// discarded and regenerated identically at any time. Player/map edits live in a
// separate sparse overlay that is re-applied after each (re)generation and is the
// only thing persisted to localStorage (save format v2).

import * as THREE from 'three'
import { createNoise2D, createNoise3D } from 'simplex-noise'
import { BLOCKS, BlockType, isTransparent } from './blocks'
import { tileUV, ATLAS_COLS, ATLAS_ROWS, TILE_SIZE } from './textures'
import { buildDungeon, buildDesertPyramid, buildLavaLake } from './structures'
import type { Slot } from './inventory'

// Block integer IDs (stored in chunk arrays for performance).
// IMPORTANT: append new block types at the end so saved worlds stay compatible.
const BLOCK_IDS: BlockType[] = [
  'air', 'grass', 'dirt', 'stone', 'wood', 'leaves', 'sand', 'water',
  'planks', 'cobblestone', 'bedrock', 'glass', 'brick', 'gold', 'diamond',
  'snow', 'ice', 'cactus', 'flower_red', 'flower_yellow', 'coal_ore', 'iron_ore',
  'stairs', 'slab', 'fence', 'door', 'ladder', 'tnt', 'glowstone',
  // New in v1.2: structures & Tokyo blocks
  'lava', 'obsidian', 'sandstone', 'chest', 'spawner', 'mossy_cobblestone',
  'cherry_leaves', 'cherry_wood', 'red_wool', 'lantern'
]
const ID_TO_TYPE = new Map<number, BlockType>()
const TYPE_TO_ID = new Map<BlockType, number>()
BLOCK_IDS.forEach((t, i) => {
  ID_TO_TYPE.set(i, t)
  TYPE_TO_ID.set(t, i)
})

/** Legacy horizontal extent — city maps still center on (WORLD_SIZE_X/2, WORLD_SIZE_Z/2). */
export const WORLD_SIZE_X = 208
/** Hard vertical limit (bedrock floor to sky). */
export const WORLD_SIZE_Y = 48
export const WORLD_SIZE_Z = 208
export const WATER_LEVEL = 12

export const CHUNK_SIZE = 16
const CHUNK_VOL = CHUNK_SIZE * CHUNK_SIZE * WORLD_SIZE_Y

/** Streaming radius clamps (in chunks). */
export const MIN_STREAM_RADIUS = 3
export const MAX_STREAM_RADIUS = 11
export const DEFAULT_RENDER_DISTANCE = 96

/** Packs chunk coords into a unique integer key (valid for ±32768 chunks). */
export function chunkKey(cx: number, cz: number): number {
  return (((cx + 0x8000) << 16) | ((cz + 0x8000) & 0xffff))
}

/** Deterministic coordinate hash → [0, 1). Drives all scatter/structure RNG so
 *  chunks regenerate identically regardless of the order they load in. */
function hashRand(seed: number, x: number, z: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) | 0
  h = Math.imul(h ^ x, 0x27d4eb2d)
  h ^= h >>> 15
  h = Math.imul(h ^ z, 0x165667b1)
  h ^= h >>> 13
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// Biome definitions for terrain variety.
export type BiomeType = 'plains' | 'forest' | 'desert' | 'snow' | 'ocean'

interface BiomeDef {
  type: BiomeType
  surface: BlockType // Top block (above water)
  subsurface: BlockType // 3 blocks under surface
  treeChance: number // 0..1 probability per column
  cactusChance: number
  flowerChance: number
  waterBlock?: BlockType // For frozen biomes
  hasSnow?: boolean
}

const BIOMES: Record<BiomeType, BiomeDef> = {
  plains: { type: 'plains', surface: 'grass', subsurface: 'dirt', treeChance: 0.03, cactusChance: 0, flowerChance: 0.06 },
  forest: { type: 'forest', surface: 'grass', subsurface: 'dirt', treeChance: 0.12, cactusChance: 0, flowerChance: 0.04 },
  desert: { type: 'desert', surface: 'sand', subsurface: 'sand', treeChance: 0, cactusChance: 0.05, flowerChance: 0 },
  snow:   { type: 'snow',   surface: 'snow', subsurface: 'dirt', treeChance: 0.04, cactusChance: 0, flowerChance: 0, hasSnow: true },
  ocean:  { type: 'ocean',  surface: 'sand', subsurface: 'sand', treeChance: 0, cactusChance: 0, flowerChance: 0 },
}

const SAVE_KEY = 'voxelcraft_world_v2'
const SAVE_META_KEY = 'voxelcraft_meta_v2'
const SAVE_CHESTS_KEY = 'voxelcraft_chests_v2'
// Pre-streaming save format (fixed 208×208 snapshot) — kept only for one-shot migration.
const SAVE_KEY_V1 = 'voxelcraft_world_v1'
const SAVE_META_KEY_V1 = 'voxelcraft_meta_v1'
const SAVE_CHESTS_KEY_V1 = 'voxelcraft_chests_v1'

export interface WorldSaveMeta {
  seed: number
  savedAt: number
  playerX: number
  playerY: number
  playerZ: number
  playerYaw: number
  playerPitch: number
}

/** One streamed chunk: voxel data + the three render-pass meshes. */
class Chunk {
  data = new Uint8Array(CHUNK_VOL)
  generated = false
  meshed = false
  opaque: THREE.Mesh | null = null
  cutout: THREE.Mesh | null = null
  translucent: THREE.Mesh | null = null
  constructor(readonly cx: number, readonly cz: number) {}
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[])
  }
  return btoa(bin)
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export class World {
  /** All currently loaded chunks, keyed by chunkKey(cx, cz). */
  chunks = new Map<number, Chunk>()
  /** Sparse player/map edits per chunk: localIndex → blockId. Survives unload. */
  private edits = new Map<number, Map<number, number>>()
  /** Storage for chest inventories keyed by `${x},${y},${z}`. */
  private chests: Map<string, Slot[]> = new Map()
  /** Chunk keys whose minimap colors changed since the minimap last read them. */
  private minimapDirty = new Set<number>()

  private opaqueMaterial: THREE.Material
  private cutoutMaterial: THREE.Material
  private translucentMaterial: THREE.Material
  private scene: THREE.Scene
  readonly seed: number

  /** The chunk currently being generated — setBlock writes are clipped to it. */
  private genClip: Chunk | null = null

  // ----- Streaming state -----
  /** When true, streams endless chunks in all directions. When false, limits generation to the fixed map bounds. */
  unlimitedMap: boolean = false
  private streamCenter: [number, number] | null = null
  private streamRadius = Math.round(DEFAULT_RENDER_DISTANCE / CHUNK_SIZE)
  private streamPlan: [number, number][] = []
  private dirtyQueue: [number, number][] = []
  private dirtySet = new Set<number>()
  /** Chunks left to mesh for the initial world-load progress bar. */
  private initialPending = new Set<number>()
  private initialTotal = 0

  // ----- Deterministic noise fields (seeded once, sampled by absolute coords) -----
  private terrainNoise1: (x: number, y: number) => number
  private terrainNoise2: (x: number, y: number) => number
  private terrainNoise3: (x: number, y: number) => number
  private biomeNoiseTemp: (x: number, y: number) => number
  private biomeNoiseRain: (x: number, y: number) => number
  private caveNoise: (x: number, y: number, z: number) => number
  private caveNoise2: (x: number, y: number, z: number) => number
  private oreNoiseCoal: (x: number, y: number, z: number) => number
  private oreNoiseIron: (x: number, y: number, z: number) => number
  private oreNoiseGold: (x: number, y: number, z: number) => number
  private oreNoiseDia: (x: number, y: number, z: number) => number

  constructor(scene: THREE.Scene, atlasTexture: THREE.Texture, seed?: number, spawn?: { x: number; z: number }, unlimitedMap: boolean = false) {
    this.scene = scene
    this.seed = seed ?? Math.floor(Math.random() * 0x7fffffff)
    this.unlimitedMap = unlimitedMap

    this.opaqueMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      alphaTest: 0.5,
    })
    this.cutoutMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      transparent: false,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
    this.translucentMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      transparent: true,
      opacity: 0.78,
      depthWrite: true,
      side: THREE.DoubleSide,
      alphaTest: 0.05,
    })

    // Seed the noise permutation tables (order matters — must stay stable so
    // the same seed always produces the same terrain).
    const s = this.seed
    const sfc32 = (a: number, b: number, c: number, d: number) => () => {
      a |= 0; b |= 0; c |= 0; d |= 0
      const t = (a + b | 0) + d | 0
      d = d + 1 | 0
      a = b ^ (b >>> 9)
      b = c + (c << 3) | 0
      c = (c << 21 | c >>> 11) + t | 0
      return (t >>> 0) / 4294967296
    }
    const rng = sfc32(s, s ^ 0xdeadbeef, s ^ 0x12345678, s ^ 0x87654321)

    this.terrainNoise1 = createNoise2D(rng)
    this.terrainNoise2 = createNoise2D(rng)
    this.terrainNoise3 = createNoise2D(rng)
    this.biomeNoiseTemp = createNoise2D(rng)
    this.biomeNoiseRain = createNoise2D(rng)
    this.caveNoise = createNoise3D(rng)
    this.caveNoise2 = createNoise3D(rng)
    this.oreNoiseCoal = createNoise3D(rng)
    this.oreNoiseIron = createNoise3D(rng)
    this.oreNoiseGold = createNoise3D(rng)
    this.oreNoiseDia = createNoise3D(rng)

    // Pre-generate the spawn area synchronously (data only — meshes fill in
    // lazily through the game loop's meshDirtyChunks budget).
    const sp = spawn ?? { x: WORLD_SIZE_X / 2, z: WORLD_SIZE_Z / 2 }
    this.updateStreaming(scene, sp.x, sp.z, Infinity)
  }

  // ----- Streaming -----

  /** Enable or disable unlimited endless terrain streaming dynamically. */
  setUnlimitedMap(enabled: boolean): void {
    if (this.unlimitedMap === enabled) return
    this.unlimitedMap = enabled
    if (!enabled) {
      const maxCx = Math.ceil(WORLD_SIZE_X / CHUNK_SIZE)
      const maxCz = Math.ceil(WORLD_SIZE_Z / CHUNK_SIZE)
      for (const [k, chunk] of this.chunks) {
        if (chunk.cx < 0 || chunk.cx >= maxCx || chunk.cz < 0 || chunk.cz >= maxCz) {
          this.unloadChunk(k, chunk)
        }
      }
    }
    this.streamCenter = null
  }

  /** Number of currently loaded chunks (HUD/debug). */
  get chunkCount(): number { return this.chunks.size }

  get isMeshing(): boolean { return this.dirtyQueue.length > 0 }

  get meshProgress(): number {
    if (this.initialTotal <= 0 || this.initialPending.size === 0) return 1
    return (this.initialTotal - this.initialPending.size) / this.initialTotal
  }

  /** Sets the view distance in blocks; clamps to streaming radius limits,
   *  updates scene fog to hide the chunk edge, and forces a plan rebuild. */
  setRenderDistance(blocks: number): void {
    const r = Math.max(MIN_STREAM_RADIUS, Math.min(MAX_STREAM_RADIUS, Math.round(blocks / CHUNK_SIZE)))
    if (r === this.streamRadius) return
    this.streamRadius = r
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = r * CHUNK_SIZE * 0.45
      this.scene.fog.far = r * CHUNK_SIZE
    }
    this.streamCenter = null // force rebuild on next update
  }

  /**
   * Streams chunks around the player: generates up to `genBudget` missing
   * chunks (nearest first), queues unmeshed ones for the meshing budget, and
   * unloads chunks beyond the radius (their edits are kept).
   */
  updateStreaming(scene: THREE.Scene, px: number, pz: number, genBudget = 2): void {
    const ccx = Math.floor(px / CHUNK_SIZE)
    const ccz = Math.floor(pz / CHUNK_SIZE)
    if (!this.streamCenter || this.streamCenter[0] !== ccx || this.streamCenter[1] !== ccz) {
      this.streamCenter = [ccx, ccz]
      this.rebuildStreamPlan(ccx, ccz)
    }

    let generated = 0
    for (const [cx, cz] of this.streamPlan) {
      if (generated >= genBudget) break
      const k = chunkKey(cx, cz)
      const chunk = this.chunks.get(k)
      if (!chunk) {
        this.ensureChunk(cx, cz)
        this.queueMesh(cx, cz)
        generated++
      } else if (!chunk.meshed && !this.dirtySet.has(k)) {
        this.queueMesh(cx, cz)
      }
    }
  }

  private rebuildStreamPlan(ccx: number, ccz: number): void {
    const R = this.streamRadius
    const maxCx = Math.ceil(WORLD_SIZE_X / CHUNK_SIZE)
    const maxCz = Math.ceil(WORLD_SIZE_Z / CHUNK_SIZE)
    const plan: [number, number][] = []
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = ccx + dx
        const cz = ccz + dz
        if (!this.unlimitedMap) {
          if (cx < 0 || cx >= maxCx || cz < 0 || cz >= maxCz) continue
        }
        if (dx * dx + dz * dz <= (R + 0.5) * (R + 0.5)) plan.push([cx, cz])
      }
    }
    plan.sort((a, b) => {
      const da = (a[0] - ccx) ** 2 + (a[1] - ccz) ** 2
      const db = (b[0] - ccx) ** 2 + (b[1] - ccz) ** 2
      return da - db
    })
    this.streamPlan = plan

    // First plan after (re)spawn defines the initial-load progress bar.
    if (this.initialTotal <= 0) {
      for (const [cx, cz] of plan) this.initialPending.add(chunkKey(cx, cz))
      this.initialTotal = this.initialPending.size
    }

    // Queue any planned chunk that exists but isn't meshed yet.
    for (const [cx, cz] of plan) {
      const chunk = this.chunks.get(chunkKey(cx, cz))
      if (chunk && chunk.generated && !chunk.meshed) this.queueMesh(cx, cz)
    }

    // Keep the mesh queue ordered nearest-first.
    this.dirtyQueue.sort((a, b) => {
      const da = (a[0] - ccx) ** 2 + (a[1] - ccz) ** 2
      const db = (b[0] - ccx) ** 2 + (b[1] - ccz) ** 2
      return da - db
    })

    // Unload far chunks — voxel data is regenerated deterministically on
    // return; edits live in the overlay and meshes are disposed here.
    for (const [k, chunk] of this.chunks) {
      if (!this.unlimitedMap && (chunk.cx < 0 || chunk.cx >= maxCx || chunk.cz < 0 || chunk.cz >= maxCz)) {
        this.unloadChunk(k, chunk)
        continue
      }
      const dist = Math.max(Math.abs(chunk.cx - ccx), Math.abs(chunk.cz - ccz))
      if (dist > R + 2) this.unloadChunk(k, chunk)
    }
  }

  /** Synchronously generates + meshes the 3×3 chunks around a position — used
   *  before respawning/teleporting so the player never lands in a void. */
  ensureAreaReady(scene: THREE.Scene, x: number, z: number, r = 1): void {
    const ccx = Math.floor(x / CHUNK_SIZE)
    const ccz = Math.floor(z / CHUNK_SIZE)
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        this.ensureChunk(ccx + dx, ccz + dz)
        this.rebuildChunk(scene, ccx + dx, ccz + dz)
      }
    }
  }

  private unloadChunk(k: number, chunk: Chunk): void {
    for (const m of [chunk.opaque, chunk.cutout, chunk.translucent]) {
      if (m) {
        this.scene.remove(m)
        m.geometry.dispose()
      }
    }
    chunk.opaque = chunk.cutout = chunk.translucent = null
    this.chunks.delete(k)
    this.initialPending.delete(k)
  }

  /** Reset streaming state — used after restoring a save into an already-streamed world. */
  private resetStreaming(): void {
    for (const [k, chunk] of this.chunks) this.unloadChunk(k, chunk)
    this.dirtyQueue = []
    this.dirtySet.clear()
    this.streamCenter = null
    this.streamPlan = []
    this.initialPending.clear()
    this.initialTotal = 0
  }

  private queueMesh(cx: number, cz: number): void {
    const k = chunkKey(cx, cz)
    if (this.dirtySet.has(k)) return
    this.dirtySet.add(k)
    this.dirtyQueue.push([cx, cz])
  }

  /** Mesh up to `budget` dirty chunks per frame. */
  meshDirtyChunks(scene: THREE.Scene, budget: number): number {
    let count = 0
    while (this.dirtyQueue.length > 0 && count < budget) {
      const [cx, cz] = this.dirtyQueue.shift()!
      const k = chunkKey(cx, cz)
      this.dirtySet.delete(k)
      if (!this.streamCenter) continue
      const dist = Math.max(Math.abs(cx - this.streamCenter[0]), Math.abs(cz - this.streamCenter[1]))
      if (dist > this.streamRadius) continue // walked away before meshing
      this.rebuildChunk(scene, cx, cz)
      count++
    }
    return count
  }

  markChunkDirty(cx: number, cz: number): void {
    this.queueMesh(cx, cz)
  }

  // ----- Block access -----

  inBounds(_x: number, y: number, _z: number): boolean {
    return y >= 0 && y < WORLD_SIZE_Y
  }

  /** Chunk-local data index. */
  private static localIdx(lx: number, lz: number, y: number): number {
    return lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
  }

  getBlock(x: number, y: number, z: number): BlockType {
    if (y < 0 || y >= WORLD_SIZE_Y) return 'air'
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4))
    if (!chunk) return 'air'
    // The chunk currently being generated has valid (partial) data — tree
    // placement reads it to avoid overwriting solid blocks.
    if (!chunk.generated && chunk !== this.genClip) return 'air'
    const id = chunk.data[World.localIdx(x & 15, z & 15, y)]
    return ID_TO_TYPE.get(id) ?? 'air'
  }

  /** Raw chunk data accessor for the minimap (null when not loaded). */
  getChunkData(cx: number, cz: number): Uint8Array | null {
    const chunk = this.chunks.get(chunkKey(cx, cz))
    return chunk && chunk.generated ? chunk.data : null
  }

  /** Converts a raw stored block id to its type (null for invalid ids). */
  blockIdToType(id: number): BlockType | null {
    return ID_TO_TYPE.get(id) ?? null
  }

  /** Hands off (and clears) the set of chunks whose minimap colors changed. */
  consumeMinimapDirty(): Set<number> {
    const dirty = this.minimapDirty
    this.minimapDirty = new Set()
    return dirty
  }

  isChunkLoaded(x: number, z: number): boolean {
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4))
    return !!chunk && chunk.generated
  }

  private getBlockForCulling(x: number, y: number, z: number): BlockType {
    if (y < 0) return 'bedrock'
    if (y >= WORLD_SIZE_Y) return 'air'
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4))
    if (!chunk || !chunk.generated) return 'air'
    const id = chunk.data[World.localIdx(x & 15, z & 15, y)]
    return ID_TO_TYPE.get(id) ?? 'air'
  }

  setBlock(x: number, y: number, z: number, type: BlockType): boolean {
    if (y < 0 || y >= WORLD_SIZE_Y) return false
    const id = TYPE_TO_ID.get(type) ?? 0

    // During chunk generation, writes are clipped to the chunk being built so
    // cross-chunk structures (trees, pyramids…) regenerate identically from
    // whichever chunk builds them.
    if (this.genClip) {
      const clip = this.genClip
      if ((x >> 4) !== clip.cx || (z >> 4) !== clip.cz) return true
      clip.data[World.localIdx(x & 15, z & 15, y)] = id
      return true
    }

    const cx = x >> 4
    const cz = z >> 4
    const chunk = this.ensureChunk(cx, cz)
    const i = World.localIdx(x & 15, z & 15, y)
    chunk.data[i] = id

    // Record the edit so it survives chunk unload + save/load.
    const k = chunkKey(cx, cz)
    let overlay = this.edits.get(k)
    if (!overlay) {
      overlay = new Map()
      this.edits.set(k, overlay)
    }
    overlay.set(i, id)
    this.minimapDirty.add(k)
    return true
  }

  setBlockAndUpdate(scene: THREE.Scene, x: number, y: number, z: number, type: BlockType): void {
    let finalType = type

    // Fluid interaction: Water + Lava
    if (type === 'lava') {
      const neighbors = [
        [x+1,y,z], [x-1,y,z], [x,y+1,z], [x,y-1,z], [x,y,z+1], [x,y,z-1]
      ]
      for (const [nx, ny, nz] of neighbors) {
        if (this.getBlock(nx, ny, nz) === 'water') {
          finalType = 'obsidian'
          break
        }
      }
    } else if (type === 'water') {
      const neighbors = [
        [x+1,y,z], [x-1,y,z], [x,y+1,z], [x,y-1,z], [x,y,z+1], [x,y,z-1]
      ]
      for (const [nx, ny, nz] of neighbors) {
        if (this.getBlock(nx, ny, nz) === 'lava') {
          this.setBlock(nx, ny, nz, 'obsidian')
          this.markChunkDirty(nx >> 4, nz >> 4)
        }
      }
    }

    if (!this.setBlock(x, y, z, finalType)) return
    const cx = x >> 4
    const cz = z >> 4
    this.rebuildChunk(scene, cx, cz)
    const lx = x - cx * CHUNK_SIZE
    const lz = z - cz * CHUNK_SIZE
    if (lx === 0) this.rebuildChunk(scene, cx - 1, cz)
    if (lx === CHUNK_SIZE - 1) this.rebuildChunk(scene, cx + 1, cz)
    if (lz === 0) this.rebuildChunk(scene, cx, cz - 1)
    if (lz === CHUNK_SIZE - 1) this.rebuildChunk(scene, cx, cz + 1)
  }

  // ----- Chest Storage -----

  getChestLoot(x: number, y: number, z: number): Slot[] | undefined {
    return this.chests.get(`${x},${y},${z}`)
  }

  setChestLoot(x: number, y: number, z: number, slots: Slot[]): void {
    this.chests.set(`${x},${y},${z}`, slots)
  }

  getBiome(x: number, z: number): BiomeType {
    return this.biomeAt(x, z)
  }

  // ----- Save / Load -----

  /** Serialize world edits + metadata to localStorage. Returns true on success. */
  save(player?: { x: number; y: number; z: number; yaw: number; pitch: number }): boolean {
    try {
      const editBlobs: Record<string, string> = {}
      for (const [k, overlay] of this.edits) {
        if (overlay.size === 0) continue
        const idxs = Array.from(overlay.keys()).sort((a, b) => a - b)
        const bytes = new Uint8Array(idxs.length * 3)
        let o = 0
        for (const i of idxs) {
          bytes[o++] = i & 0xff
          bytes[o++] = (i >> 8) & 0xff
          bytes[o++] = overlay.get(i)!
        }
        editBlobs[String(k)] = uint8ToBase64(bytes)
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, seed: this.seed, edits: editBlobs }))
      const meta: WorldSaveMeta = {
        seed: this.seed,
        savedAt: Date.now(),
        playerX: player?.x ?? 0,
        playerY: player?.y ?? 0,
        playerZ: player?.z ?? 0,
        playerYaw: player?.yaw ?? 0,
        playerPitch: player?.pitch ?? 0,
      }
      localStorage.setItem(SAVE_META_KEY, JSON.stringify(meta))
      localStorage.setItem(SAVE_CHESTS_KEY, JSON.stringify(Array.from(this.chests.entries())))
      return true
    } catch (e) {
      console.warn('World save failed:', e)
      return false
    }
  }

  static hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY) || !!localStorage.getItem(SAVE_KEY_V1)
    } catch {
      return false
    }
  }

  static loadMeta(): WorldSaveMeta | null {
    try {
      const raw = localStorage.getItem(SAVE_META_KEY) ?? localStorage.getItem(SAVE_META_KEY_V1)
      if (!raw) return null
      return JSON.parse(raw) as WorldSaveMeta
    } catch {
      return null
    }
  }

  load(scene: THREE.Scene): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { v?: number; seed?: number; edits?: Record<string, string> }
        if (parsed?.v === 2) {
          this.edits.clear()
          const editBlobs = parsed.edits ?? {}
          for (const kstr of Object.keys(editBlobs)) {
            const bytes = base64ToUint8(editBlobs[kstr])
            const overlay = new Map<number, number>()
            for (let i = 0; i + 2 < bytes.length; i += 3) {
              overlay.set(bytes[i] | (bytes[i + 1] << 8), bytes[i + 2])
            }
            if (overlay.size > 0) this.edits.set(Number(kstr), overlay)
          }
          const chestsRaw = localStorage.getItem(SAVE_CHESTS_KEY)
          if (chestsRaw) this.chests = new Map(JSON.parse(chestsRaw))
          // Chunks generated before the edits were restored are stale — drop
          // everything; streaming regenerates with the overlay applied.
          this.resetStreaming()
          const meta = World.loadMeta()
          const sp = meta ? { x: meta.playerX, z: meta.playerZ } : undefined
          this.updateStreaming(scene, sp?.x ?? WORLD_SIZE_X / 2, sp?.z ?? WORLD_SIZE_Z / 2, Infinity)
          return true
        }
      }
      return this.migrateV1(scene)
    } catch (e) {
      console.warn('World load failed:', e)
      return false
    }
  }

  loadFromSave(scene: THREE.Scene): boolean {
    return this.load(scene)
  }

  /** One-shot migration of the pre-streaming fixed-world save: regenerate the
   *  old 208×208 area with this seed and diff it against the snapshot — every
   *  difference (cities, player builds, old tree shapes) becomes an edit. */
  private migrateV1(scene: THREE.Scene): boolean {
    try {
      const b64 = localStorage.getItem(SAVE_KEY_V1)
      if (!b64) return false
      const bin = atob(b64)
      const expected = WORLD_SIZE_X * WORLD_SIZE_Y * WORLD_SIZE_Z
      if (bin.length !== expected) {
        localStorage.removeItem(SAVE_KEY_V1)
        return false
      }
      const v1 = (x: number, y: number, z: number) =>
        bin.charCodeAt(x + z * WORLD_SIZE_X + y * WORLD_SIZE_X * WORLD_SIZE_Z)

      this.edits.clear()
      for (let cz = 0; cz < WORLD_SIZE_Z / CHUNK_SIZE; cz++) {
        for (let cx = 0; cx < WORLD_SIZE_X / CHUNK_SIZE; cx++) {
          const chunk = this.ensureChunk(cx, cz)
          const k = chunkKey(cx, cz)
          let overlay: Map<number, number> | null = null
          for (let y = 0; y < WORLD_SIZE_Y; y++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
              for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                const id = v1(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz)
                const i = World.localIdx(lx, lz, y)
                if (chunk.data[i] !== id) {
                  if (!overlay) {
                    overlay = new Map()
                    this.edits.set(k, overlay)
                  }
                  overlay.set(i, id)
                  chunk.data[i] = id
                }
              }
            }
          }
        }
      }

      // Carry over chests + player meta, drop v1 keys, then persist the
      // migrated edits as the v2 world blob (save() re-writes meta/chests too).
      const chestsRaw = localStorage.getItem(SAVE_CHESTS_KEY_V1)
      if (chestsRaw) this.chests = new Map(JSON.parse(chestsRaw))
      const metaRaw = localStorage.getItem(SAVE_META_KEY_V1)
      if (metaRaw) localStorage.setItem(SAVE_META_KEY, metaRaw)
      localStorage.removeItem(SAVE_KEY_V1)
      localStorage.removeItem(SAVE_META_KEY_V1)
      localStorage.removeItem(SAVE_CHESTS_KEY_V1)

      const meta = World.loadMeta()
      this.save(meta ? {
        x: meta.playerX, y: meta.playerY, z: meta.playerZ,
        yaw: meta.playerYaw, pitch: meta.playerPitch,
      } : undefined)

      this.resetStreaming()
      this.updateStreaming(scene, meta?.playerX ?? WORLD_SIZE_X / 2, meta?.playerZ ?? WORLD_SIZE_Z / 2, Infinity)
      return true
    } catch (e) {
      console.warn('World v1 migration failed:', e)
      return false
    }
  }

  static clearSave(): void {
    try {
      localStorage.removeItem(SAVE_KEY)
      localStorage.removeItem(SAVE_META_KEY)
      localStorage.removeItem(SAVE_CHESTS_KEY)
      localStorage.removeItem(SAVE_KEY_V1)
      localStorage.removeItem(SAVE_META_KEY_V1)
      localStorage.removeItem(SAVE_CHESTS_KEY_V1)
    } catch (e) {
      console.warn('Clear save failed:', e)
    }
  }

  // ----- Terrain Generation (deterministic per column) -----

  /** Biome at an absolute column — pure function of (seed, x, z). */
  private biomeAt(x: number, z: number): BiomeType {
    const temp = this.biomeNoiseTemp(x * 0.005, z * 0.005)
    const rain = this.biomeNoiseRain(x * 0.005, z * 0.005)
    if (rain < -0.35) return 'desert'
    if (temp < -0.3) return 'snow'
    if (rain > 0.3) return 'forest'
    if (temp > 0.4 && rain < 0) return 'desert'
    return 'plains'
  }

  /** Terrain surface height at an absolute column — pure function of (seed, x, z). */
  private heightAt(x: number, z: number): number {
    const biomeType = this.biomeAt(x, z)
    const n1 = this.terrainNoise1(x * 0.015, z * 0.015)
    const n2 = this.terrainNoise2(x * 0.04, z * 0.04) * 0.4
    const n3 = this.terrainNoise3(x * 0.1, z * 0.1) * 0.15
    const elevation = (n1 + n2 + n3) * 0.5 + 0.5
    let h: number
    if (biomeType === 'snow') {
      h = Math.floor(16 + elevation * 20)
    } else if (biomeType === 'desert') {
      h = Math.floor(13 + elevation * 10)
    } else {
      h = Math.floor(12 + elevation * 15)
    }
    return Math.max(1, Math.min(WORLD_SIZE_Y - 2, h))
  }

  /** Terrain block at (x, y, z) for a column of surface height h — pure. */
  private terrainBlockAt(x: number, y: number, z: number, h: number, biome: BiomeDef): BlockType {
    if (y === 0) return 'bedrock'
    if (y > h) {
      if (h < WATER_LEVEL && y <= WATER_LEVEL) return biome.hasSnow ? 'ice' : 'water'
      return 'air'
    }
    let type: BlockType
    if (y === h) {
      type = h < WATER_LEVEL ? 'sand' : biome.surface
    } else if (y >= h - 3) {
      type = h < WATER_LEVEL ? 'sand' : biome.subsurface
    } else {
      type = 'stone'
      if (this.oreNoiseDia(x * 0.15, y * 0.15, z * 0.15) > 0.78 && y < 8) type = 'diamond'
      else if (this.oreNoiseGold(x * 0.12, y * 0.12, z * 0.12) > 0.72 && y < 14) type = 'gold'
      else if (this.oreNoiseIron(x * 0.1, y * 0.1, z * 0.1) > 0.65 && y < 24) type = 'iron_ore'
      else if (this.oreNoiseCoal(x * 0.08, y * 0.08, z * 0.08) > 0.62) type = 'coal_ore'
    }

    // Carve caves
    if (y > 1 && y < h - 1 && biome.type !== 'ocean') {
      const c1 = this.caveNoise(x * 0.08, y * 0.1, z * 0.08)
      const c2 = this.caveNoise2(x * 0.05, y * 0.06, z * 0.05)
      if (Math.abs(c1) < 0.07 && Math.abs(c2) < 0.15) return 'air'
      if (c1 > 0.85 && y < h - 4) return 'air'
    }
    return type
  }

  private ensureChunk(cx: number, cz: number): Chunk {
    const k = chunkKey(cx, cz)
    let chunk = this.chunks.get(k)
    if (!chunk) {
      chunk = new Chunk(cx, cz)
      this.chunks.set(k, chunk)
    }
    if (!chunk.generated) this.generateChunk(chunk)
    return chunk
  }

  private generateChunk(chunk: Chunk): void {
    const prevClip = this.genClip
    this.genClip = chunk
    const x0 = chunk.cx * CHUNK_SIZE
    const z0 = chunk.cz * CHUNK_SIZE

    // Pass 1: terrain columns (heightmap, caves, ores, water).
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = x0 + lx
        const wz = z0 + lz
        const h = this.heightAt(wx, wz)
        const biome = BIOMES[this.biomeAt(wx, wz)]
        const top = Math.max(h, h < WATER_LEVEL ? WATER_LEVEL : h)
        for (let y = 0; y <= top; y++) {
          const t = this.terrainBlockAt(wx, y, wz, h, biome)
          chunk.data[World.localIdx(lx, lz, y)] = TYPE_TO_ID.get(t) ?? 0
        }
      }
    }

    // Pass 2: decorations (trees, cacti, flowers). A 3-block margin around the
    // chunk is evaluated so trees straddling a border grow identically from
    // both sides; writes outside this chunk are clipped (setBlock → genClip).
    for (let wx = x0 - 3; wx < x0 + CHUNK_SIZE + 3; wx++) {
      for (let wz = z0 - 3; wz < z0 + CHUNK_SIZE + 3; wz++) {
        this.decorateColumn(wx, wz)
      }
    }

    // Pass 3: region-hash structures (dungeons, pyramids, lava lakes).
    this.generateStructures(x0, z0)

    // Finally: re-apply player/map edits recorded for this chunk.
    const overlay = this.edits.get(chunkKey(chunk.cx, chunk.cz))
    if (overlay) {
      for (const [i, id] of overlay) chunk.data[i] = id
    }

    chunk.generated = true
    this.genClip = prevClip
  }

  /** Trees/cacti/flowers for one column — decision is a pure hash so every
   *  chunk that overlaps this column's plants agrees on them. */
  private decorateColumn(wx: number, wz: number): void {
    const biomeType = this.biomeAt(wx, wz)
    const biome = BIOMES[biomeType]
    const r = hashRand(this.seed, wx, wz, 0x5eed)
    const total = biome.treeChance + biome.cactusChance + biome.flowerChance
    if (r >= total) return

    const h = this.heightAt(wx, wz)
    if (h < WATER_LEVEL) return

    // Find the post-cave surface (topmost non-air terrain block).
    let surfY = -1
    let surfBlock: BlockType = 'air'
    for (let y = h; y >= 0; y--) {
      const t = this.terrainBlockAt(wx, y, wz, h, biome)
      if (t !== 'air') {
        surfY = y
        surfBlock = t
        break
      }
    }
    if (surfY < 0) return

    if (r < biome.treeChance && (surfBlock === 'grass' || surfBlock === 'snow')) {
      this.plantTree(wx, surfY + 1, wz, biomeType === 'snow')
    } else if (r < biome.treeChance + biome.cactusChance && surfBlock === 'sand') {
      const ch = 1 + Math.floor(hashRand(this.seed, wx, wz, 0xca27) * 3)
      for (let i = 1; i <= ch; i++) this.setBlock(wx, surfY + i, wz, 'cactus')
    } else if (r < biome.treeChance + biome.cactusChance + biome.flowerChance && surfBlock === 'grass') {
      this.setBlock(wx, surfY + 1, wz, hashRand(this.seed, wx, wz, 0xf10a) < 0.5 ? 'flower_red' : 'flower_yellow')
    }
  }

  private plantTree(x: number, y: number, z: number, snowBiome: boolean): void {
    const trunkH = 4 + Math.floor(hashRand(this.seed, x, z, 0x7ee1) * 2)
    for (let i = 0; i < trunkH; i++) {
      this.setBlock(x, y + i, z, 'wood')
    }
    const topY = y + trunkH
    for (let dy = -1; dy <= 1; dy++) {
      const ly = topY + dy
      const radius = dy === 1 ? 1 : 2
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue
          if (Math.abs(dx) === radius && Math.abs(dz) === radius &&
              hashRand(this.seed, x + dx, z + dz * 31 + ly * 131, 0x1eaf) < 0.6) continue
          const lx = x + dx
          const lz = z + dz
          if (this.getBlock(lx, ly, lz) === 'air') {
            this.setBlock(lx, ly, lz, snowBiome ? 'snow' : 'leaves')
          }
        }
      }
    }
    this.setBlock(x, topY + 1, z, snowBiome ? 'snow' : 'leaves')
  }

  /** Region-hash structure placement: each structure type lives on a fixed
   *  region grid; the region's hash decides existence + position, so any chunk
   *  overlapping the structure rebuilds exactly the same blocks. */
  private generateStructures(x0: number, z0: number): void {
    const x1 = x0 + CHUNK_SIZE - 1
    const z1 = z0 + CHUNK_SIZE - 1

    // Underground dungeons — region grid 80, ~50% of regions have one (7×5×7 footprint).
    const dgR = 80
    for (let rx = Math.floor((x0 - 3) / dgR); rx <= Math.floor((x1 + 3) / dgR); rx++) {
      for (let rz = Math.floor((z0 - 3) / dgR); rz <= Math.floor((z1 + 3) / dgR); rz++) {
        if (hashRand(this.seed, rx, rz, 0xd061) >= 0.5) continue
        const sx = rx * dgR + 8 + Math.floor(hashRand(this.seed, rx, rz, 0xd062) * (dgR - 24))
        const sz = rz * dgR + 8 + Math.floor(hashRand(this.seed, rx, rz, 0xd063) * (dgR - 24))
        if (sx + 3 < x0 || sx - 3 > x1 || sz + 3 < z0 || sz - 3 > z1) continue
        const sy = 5 + Math.floor(hashRand(this.seed, rx, rz, 0xd064) * 10)
        let salt = 0xd065
        const rand = () => hashRand(this.seed, sx, sz, salt++)
        buildDungeon(this, sx, sy, sz, rand)
      }
    }

    // Desert pyramids — region grid 96, only on desert terrain of valid height (13×13 footprint).
    const pyR = 96
    for (let rx = Math.floor((x0 - 6) / pyR); rx <= Math.floor((x1 + 6) / pyR); rx++) {
      for (let rz = Math.floor((z0 - 6) / pyR); rz <= Math.floor((z1 + 6) / pyR); rz++) {
        if (hashRand(this.seed, rx, rz, 0x9b1d) >= 0.45) continue
        const px = rx * pyR + 12 + Math.floor(hashRand(this.seed, rx, rz, 0x9b1e) * (pyR - 24))
        const pz = rz * pyR + 12 + Math.floor(hashRand(this.seed, rx, rz, 0x9b1f) * (pyR - 24))
        if (px + 6 < x0 || px - 6 > x1 || pz + 6 < z0 || pz - 6 > z1) continue
        if (this.biomeAt(px, pz) !== 'desert') continue
        const baseY = this.heightAt(px, pz)
        if (baseY < 12 || baseY > 30) continue
        let salt = 0x9b20
        const rand = () => hashRand(this.seed, px, pz, salt++)
        buildDesertPyramid(this, px, pz, baseY, rand)
      }
    }

    // Lava lakes in caves — region grid 64 (radius 3 + rim ≈ 4).
    const llR = 64
    for (let rx = Math.floor((x0 - 4) / llR); rx <= Math.floor((x1 + 4) / llR); rx++) {
      for (let rz = Math.floor((z0 - 4) / llR); rz <= Math.floor((z1 + 4) / llR); rz++) {
        if (hashRand(this.seed, rx, rz, 0x1a7a) >= 0.35) continue
        const lx = rx * llR + 8 + Math.floor(hashRand(this.seed, rx, rz, 0x1a7b) * (llR - 16))
        const lz = rz * llR + 8 + Math.floor(hashRand(this.seed, rx, rz, 0x1a7c) * (llR - 16))
        if (lx + 4 < x0 || lx - 4 > x1 || lz + 4 < z0 || lz - 4 > z1) continue
        const ly = 4 + Math.floor(hashRand(this.seed, rx, rz, 0x1a7d) * 6)
        let salt = 0x1a7e
        const rand = () => hashRand(this.seed, lx, lz, salt++)
        buildLavaLake(this, lx, ly, lz, 3, rand)
      }
    }
  }

  /** Raycast through voxel grid using DDA. Returns the first solid block hit + the face normal. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance = 6): {
    x: number; y: number; z: number; nx: number; ny: number; nz: number
  } | null {
    let x = Math.floor(origin.x)
    let y = Math.floor(origin.y)
    let z = Math.floor(origin.z)

    const stepX = Math.sign(dir.x)
    const stepY = Math.sign(dir.y)
    const stepZ = Math.sign(dir.z)

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity

    const distToBoundary = (o: number, s: number) => {
      if (s > 0) return Math.ceil(o) - o
      if (s < 0) return o - Math.floor(o)
      return Infinity
    }
    let tMaxX = dir.x !== 0 ? distToBoundary(origin.x, stepX) * tDeltaX : Infinity
    let tMaxY = dir.y !== 0 ? distToBoundary(origin.y, stepY) * tDeltaY : Infinity
    let tMaxZ = dir.z !== 0 ? distToBoundary(origin.z, stepZ) * tDeltaZ : Infinity

    let nx = 0, ny = 0, nz = 0
    let t = 0

    while (t <= maxDistance) {
      const block = this.getBlock(x, y, z)
      if (block !== 'air' && block !== 'water' && block !== 'lava' && block !== 'flower_red' && block !== 'flower_yellow' && block !== 'ladder') {
        return { x, y, z, nx, ny, nz }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX
        t = tMaxX
        tMaxX += tDeltaX
        nx = -stepX; ny = 0; nz = 0
      } else if (tMaxY < tMaxZ) {
        y += stepY
        t = tMaxY
        tMaxY += tDeltaY
        nx = 0; ny = -stepY; nz = 0
      } else {
        z += stepZ
        t = tMaxZ
        tMaxZ += tDeltaZ
        nx = 0; ny = 0; nz = -stepZ
      }
    }
    return null
  }

  /** Finds the highest non-air block at (x, z), generating the column's chunk
   *  on demand. Returns -1 if the column is empty. */
  highestBlockY(x: number, z: number): number {
    const chunk = this.ensureChunk(x >> 4, z >> 4)
    const col = (x & 15) + (z & 15) * CHUNK_SIZE
    for (let y = WORLD_SIZE_Y - 1; y >= 0; y--) {
      const t = ID_TO_TYPE.get(chunk.data[col + y * CHUNK_SIZE * CHUNK_SIZE])
      if (t !== 'air' && t !== 'water' && t !== 'ice' && t !== 'flower_red' && t !== 'flower_yellow') return y
    }
    return -1
  }

  dispose(): void {
    for (const [, chunk] of this.chunks) {
      for (const m of [chunk.opaque, chunk.cutout, chunk.translucent]) {
        if (m) {
          this.scene.remove(m)
          m.geometry.dispose()
        }
      }
    }
    this.opaqueMaterial.dispose()
    this.cutoutMaterial.dispose()
    this.translucentMaterial.dispose()
  }

  // ----- Chunk meshing -----

  private rebuildChunk(scene: THREE.Scene, cx: number, cz: number): void {
    const k = chunkKey(cx, cz)
    const chunk = this.chunks.get(k)
    if (!chunk || !chunk.generated) return

    if (chunk.opaque) { scene.remove(chunk.opaque); chunk.opaque.geometry.dispose(); chunk.opaque = null }
    if (chunk.cutout) { scene.remove(chunk.cutout); chunk.cutout.geometry.dispose(); chunk.cutout = null }
    if (chunk.translucent) { scene.remove(chunk.translucent); chunk.translucent.geometry.dispose(); chunk.translucent = null }

    const opaque = this.buildChunkGeometry(cx, cz, 'opaque')
    const cutout = this.buildChunkGeometry(cx, cz, 'cutout')
    const translucent = this.buildChunkGeometry(cx, cz, 'translucent')

    if (opaque) {
      const mesh = new THREE.Mesh(opaque, this.opaqueMaterial)
      mesh.name = `chunk_opaque_${cx}_${cz}`
      chunk.opaque = mesh
      scene.add(mesh)
    }
    if (cutout) {
      const mesh = new THREE.Mesh(cutout, this.cutoutMaterial)
      mesh.name = `chunk_cutout_${cx}_${cz}`
      mesh.renderOrder = 1
      chunk.cutout = mesh
      scene.add(mesh)
    }
    if (translucent) {
      const mesh = new THREE.Mesh(translucent, this.translucentMaterial)
      mesh.name = `chunk_trans_${cx}_${cz}`
      mesh.renderOrder = 2
      chunk.translucent = mesh
      scene.add(mesh)
    }

    chunk.meshed = true
    this.dirtySet.delete(k)
    this.initialPending.delete(k)
  }

  private buildChunkGeometry(cx: number, cz: number, pass: 'opaque' | 'cutout' | 'translucent'): THREE.BufferGeometry | null {
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const colors: number[] = []

    const x0 = cx * CHUNK_SIZE
    const z0 = cz * CHUNK_SIZE

    const FACE_DEFS: {
      dir: [number, number, number]
      corners: [number, number, number][]
      normal: [number, number, number]
      faceKind: 0 | 1 | 2
    }[] = [
      { dir: [0, 1, 0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], normal: [0,1,0], faceKind: 0 },
      { dir: [0, -1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], normal: [0,-1,0], faceKind: 2 },
      { dir: [1, 0, 0], corners: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], normal: [1,0,0], faceKind: 1 },
      { dir: [-1, 0, 0], corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], normal: [-1,0,0], faceKind: 1 },
      { dir: [0, 0, 1], corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], normal: [0,0,1], faceKind: 1 },
      { dir: [0, 0, -1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], normal: [0,0,-1], faceKind: 1 },
    ]

    let hasGeometry = false

    for (let ly = 0; ly < WORLD_SIZE_Y; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = x0 + lx
          const wz = z0 + lz
          const block = this.getBlock(wx, ly, wz)
          if (block === 'air') continue
          const def = BLOCKS[block]
          if (!def) continue
          const isTranslucent = !!def.translucent
          const isCutout = !!def.transparent && !isTranslucent
          if (pass === 'opaque' && def.transparent) continue
          if (pass === 'cutout' && !isCutout) continue
          if (pass === 'translucent' && !isTranslucent) continue

          const isCross = !!def.cross
          const isSlab = !!def.slab

          for (const face of FACE_DEFS) {
            if (isCross && face.faceKind !== 1) continue
            const nb = this.getBlockForCulling(wx + face.dir[0], ly + face.dir[1], wz + face.dir[2])
            if (nb === block) continue
            if (nb !== 'air') {
              const nbDef = BLOCKS[nb]
              if (nbDef) {
                const nbTranslucent = !!nbDef.translucent
                const nbCutout = !!nbDef.transparent && !nbTranslucent
                const nbOpaque = !nbDef.transparent
                if (pass === 'opaque' && nbOpaque) continue
                if (pass === 'cutout' && nbCutout) continue
                if (pass === 'translucent' && nbTranslucent) continue
              }
            }
            const tile = def.tiles[face.faceKind]
            const [u0, v0, u1, v1] = tileUV(tile)
            const shade = face.faceKind === 0 ? 1.0 : face.faceKind === 2 ? 0.55 : 0.8
            const r = shade, g = shade, b = shade

            if (isCross) {
              this.pushCrossFace(positions, normals, uvs, colors, wx, ly, wz, u0, v0, u1, v1, r, g, b)
              hasGeometry = true
              break
            } else if (isSlab) {
              this.pushSlabFace(positions, normals, uvs, colors, face, wx, ly, wz, u0, v0, u1, v1, r, g, b)
              hasGeometry = true
            } else {
              this.pushFace(positions, normals, uvs, colors, face.corners, face.normal, wx, ly, wz, u0, v0, u1, v1, r, g, b)
              hasGeometry = true
            }
          }
        }
      }
    }

    if (!hasGeometry) return null

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return geo
  }

  private pushCrossFace(
    positions: number[], normals: number[], uvs: number[], colors: number[],
    x: number, y: number, z: number,
    u0: number, v0: number, u1: number, v1: number,
    r: number, g: number, b: number,
  ): void {
    const quad1: [number, number, number][] = [
      [0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0]
    ]
    this.pushFace(positions, normals, uvs, colors, quad1, [0.707, 0, 0.707], x, y, z, u0, v0, u1, v1, r, g, b)
    const quad2: [number, number, number][] = [
      [0, 0, 1], [1, 0, 0], [1, 1, 0], [0, 1, 1]
    ]
    this.pushFace(positions, normals, uvs, colors, quad2, [0.707, 0, -0.707], x, y, z, u0, v0, u1, v1, r, g, b)
  }

  private pushSlabFace(
    positions: number[], normals: number[], uvs: number[], colors: number[],
    face: { dir: [number, number, number]; corners: [number, number, number][]; normal: [number, number, number]; faceKind: 0 | 1 | 2 },
    x: number, y: number, z: number,
    u0: number, v0: number, u1: number, v1: number,
    r: number, g: number, b: number,
  ): void {
    const corners: [number, number, number][] = face.corners.map(([cx, cy, cz]) => [
      cx,
      cy === 1 ? 0.5 : 0,
      cz,
    ])
    this.pushFace(positions, normals, uvs, colors, corners, face.normal, x, y, z, u0, v0, u1, v1, r, g, b)
  }

  private pushFace(
    positions: number[], normals: number[], uvs: number[], colors: number[],
    corners: [number, number, number][], normal: [number, number, number],
    x: number, y: number, z: number,
    u0: number, v0: number, u1: number, v1: number,
    r: number, g: number, b: number,
  ): void {
    const [c0, c1, c2, c3] = corners
    const p0 = [x + c0[0], y + c0[1], z + c0[2]]
    const p1 = [x + c1[0], y + c1[1], z + c1[2]]
    const p2 = [x + c2[0], y + c2[1], z + c2[2]]
    const p3 = [x + c3[0], y + c3[1], z + c3[2]]

    positions.push(
      p0[0], p0[1], p0[2],
      p1[0], p1[1], p1[2],
      p2[0], p2[1], p2[2],
      p0[0], p0[1], p0[2],
      p2[0], p2[1], p2[2],
      p3[0], p3[1], p3[2],
    )
    for (let i = 0; i < 6; i++) {
      normals.push(normal[0], normal[1], normal[2])
      colors.push(r, g, b)
    }
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1)
  }
}

export { ATLAS_COLS, ATLAS_ROWS, TILE_SIZE, isTransparent }
