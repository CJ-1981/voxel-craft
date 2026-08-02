// World data, terrain generation, chunk meshing, and persistence for the voxel game.

import * as THREE from 'three'
import { createNoise2D, createNoise3D } from 'simplex-noise'
import { BLOCKS, BlockType, isTransparent } from './blocks'
import { tileUV, ATLAS_COLS, ATLAS_ROWS, TILE_SIZE } from './textures'

// Block integer IDs (stored in the world array for performance).
// IMPORTANT: append new block types at the end so saved worlds stay compatible.
const BLOCK_IDS: BlockType[] = [
  'air', 'grass', 'dirt', 'stone', 'wood', 'leaves', 'sand', 'water',
  'planks', 'cobblestone', 'bedrock', 'glass', 'brick', 'gold', 'diamond',
  'snow', 'ice', 'cactus', 'flower_red', 'flower_yellow', 'coal_ore', 'iron_ore',
  'stairs', 'slab', 'fence', 'door', 'ladder', 'tnt', 'glowstone',
]
const ID_TO_TYPE = new Map<number, BlockType>()
const TYPE_TO_ID = new Map<BlockType, number>()
BLOCK_IDS.forEach((t, i) => {
  ID_TO_TYPE.set(i, t)
  TYPE_TO_ID.set(t, i)
})

export const WORLD_SIZE_X = 64
export const WORLD_SIZE_Y = 48
export const WORLD_SIZE_Z = 64
export const WATER_LEVEL = 12

const CHUNK_SIZE = 16
const CHUNKS_X = WORLD_SIZE_X / CHUNK_SIZE
const CHUNKS_Z = WORLD_SIZE_Z / CHUNK_SIZE

function idx(x: number, y: number, z: number): number {
  return x + z * WORLD_SIZE_X + y * WORLD_SIZE_X * WORLD_SIZE_Z
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

const SAVE_KEY = 'voxelcraft_world_v1'
const SAVE_META_KEY = 'voxelcraft_meta_v1'

export interface WorldSaveMeta {
  seed: number
  savedAt: number
  playerX: number
  playerY: number
  playerZ: number
  playerYaw: number
  playerPitch: number
}

export class World {
  data: Uint8Array
  /** Biome per column (index = x + z * WORLD_SIZE_X). */
  biomes: Uint8Array
  chunkOpaqueMeshes: (THREE.Mesh | null)[]
  chunkCutoutMeshes: (THREE.Mesh | null)[]
  chunkTranslucentMeshes: (THREE.Mesh | null)[]
  private opaqueMaterial: THREE.Material
  private cutoutMaterial: THREE.Material
  private translucentMaterial: THREE.Material
  readonly seed: number

  constructor(scene: THREE.Scene, atlasTexture: THREE.Texture, seed?: number) {
    this.data = new Uint8Array(WORLD_SIZE_X * WORLD_SIZE_Y * WORLD_SIZE_Z)
    this.biomes = new Uint8Array(WORLD_SIZE_X * WORLD_SIZE_Z)
    this.chunkOpaqueMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null)
    this.chunkCutoutMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null)
    this.chunkTranslucentMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null)

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

    this.seed = seed ?? Math.floor(Math.random() * 0x7fffffff)
    this.generate()

    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        this.rebuildChunk(scene, cx, cz)
      }
    }
  }

  // ----- Block access -----

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WORLD_SIZE_X && y >= 0 && y < WORLD_SIZE_Y && z >= 0 && z < WORLD_SIZE_Z
  }

  getBlock(x: number, y: number, z: number): BlockType {
    if (!this.inBounds(x, y, z)) return 'air'
    const id = this.data[idx(x, y, z)]
    return ID_TO_TYPE.get(id) ?? 'air'
  }

  private getBlockForCulling(x: number, y: number, z: number): BlockType {
    if (y < 0) return 'bedrock'
    if (y >= WORLD_SIZE_Y) return 'air'
    if (x < 0 || x >= WORLD_SIZE_X || z < 0 || z >= WORLD_SIZE_Z) return 'air'
    const id = this.data[idx(x, y, z)]
    return ID_TO_TYPE.get(id) ?? 'air'
  }

  setBlock(x: number, y: number, z: number, type: BlockType): boolean {
    if (!this.inBounds(x, y, z)) return false
    const id = TYPE_TO_ID.get(type) ?? 0
    this.data[idx(x, y, z)] = id
    return true
  }

  setBlockAndUpdate(scene: THREE.Scene, x: number, y: number, z: number, type: BlockType): void {
    if (!this.setBlock(x, y, z, type)) return
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    this.rebuildChunk(scene, cx, cz)
    const lx = x - cx * CHUNK_SIZE
    const lz = z - cz * CHUNK_SIZE
    if (lx === 0 && cx > 0) this.rebuildChunk(scene, cx - 1, cz)
    if (lx === CHUNK_SIZE - 1 && cx < CHUNKS_X - 1) this.rebuildChunk(scene, cx + 1, cz)
    if (lz === 0 && cz > 0) this.rebuildChunk(scene, cx, cz - 1)
    if (lz === CHUNK_SIZE - 1 && cz < CHUNKS_Z - 1) this.rebuildChunk(scene, cx, cz + 1)
  }

  getBiome(x: number, z: number): BiomeType {
    if (x < 0 || x >= WORLD_SIZE_X || z < 0 || z >= WORLD_SIZE_Z) return 'plains'
    const id = this.biomes[x + z * WORLD_SIZE_X]
    return (['plains', 'forest', 'desert', 'snow', 'ocean'] as BiomeType[])[id] ?? 'plains'
  }

  // ----- Save / Load -----

  /** Serialize the world to localStorage. Returns true on success. */
  save(player?: { x: number; y: number; z: number; yaw: number; pitch: number }): boolean {
    try {
      // Use base64 encoding of the raw byte array for compactness.
      // The data array can be up to ~200KB which fits in localStorage.
      let bin = ''
      const chunk = 0x8000
      for (let i = 0; i < this.data.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(this.data.subarray(i, i + chunk)) as unknown as number[])
      }
      const b64 = btoa(bin)
      localStorage.setItem(SAVE_KEY, b64)
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
      return true
    } catch (e) {
      console.warn('World save failed:', e)
      return false
    }
  }

  static hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY) && !!localStorage.getItem(SAVE_META_KEY)
    } catch {
      return false
    }
  }

  static loadMeta(): WorldSaveMeta | null {
    try {
      const raw = localStorage.getItem(SAVE_META_KEY)
      return raw ? JSON.parse(raw) as WorldSaveMeta : null
    } catch {
      return null
    }
  }

  /** Loads block data from localStorage into this world. Rebuilds all chunks. */
  loadFromSave(scene: THREE.Scene): { meta: WorldSaveMeta } | null {
    try {
      const b64 = localStorage.getItem(SAVE_KEY)
      const meta = World.loadMeta()
      if (!b64 || !meta) return null
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      if (bytes.length !== this.data.length) {
        console.warn('Save size mismatch — ignoring save.')
        return null
      }
      this.data.set(bytes)
      // Biomes can't be reliably reconstructed from saved data alone, so
      // recompute them deterministically from the same seed.
      this.computeBiomes()
      for (let cz = 0; cz < CHUNKS_Z; cz++) {
        for (let cx = 0; cx < CHUNKS_X; cx++) {
          this.rebuildChunk(scene, cx, cz)
        }
      }
      return { meta }
    } catch (e) {
      console.warn('World load failed:', e)
      return null
    }
  }

  static clearSave(): void {
    try {
      localStorage.removeItem(SAVE_KEY)
      localStorage.removeItem(SAVE_META_KEY)
    } catch { /* ignore */ }
  }

  // ----- Terrain generation -----

  /** Deterministic PRNG (mulberry32) — same seed always produces same world. */
  private makeRng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
      s = (s + 0x6D2B79F5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  private computeBiomes(): void {
    const rng = this.makeRng(this.seed)
    const biomeNoise = createNoise2D(this.makeRng(this.seed + 1))
    const moistureNoise = createNoise2D(this.makeRng(this.seed + 2))
    const tempNoise = createNoise2D(this.makeRng(this.seed + 3))
    void rng

    const biomeList: BiomeType[] = ['plains', 'forest', 'desert', 'snow', 'ocean']
    for (let x = 0; x < WORLD_SIZE_X; x++) {
      for (let z = 0; z < WORLD_SIZE_Z; z++) {
        // Use 4-octave noise to create biome regions.
        const b = biomeNoise(x * 0.025, z * 0.025) // -1..1
        const m = moistureNoise(x * 0.04, z * 0.04) // -1..1
        const t = tempNoise(x * 0.03, z * 0.03) // -1..1

        let biome: BiomeType
        if (b < -0.4) {
          biome = 'ocean'
        } else if (t < -0.3) {
          biome = 'snow'
        } else if (t > 0.4 && m < 0) {
          biome = 'desert'
        } else if (m > 0.2 && b > 0) {
          biome = 'forest'
        } else {
          biome = 'plains'
        }
        this.biomes[x + z * WORLD_SIZE_X] = biomeList.indexOf(biome)
      }
    }
  }

  private generate(): void {
    this.computeBiomes()

    // Use seed-based PRNGs so terrain is deterministic per seed.
    const heightNoise = createNoise2D(this.makeRng(this.seed + 10))
    const detailNoise = createNoise2D(this.makeRng(this.seed + 11))
    const caveNoise = createNoise3D(this.makeRng(this.seed + 12))
    const caveNoise2 = createNoise3D(this.makeRng(this.seed + 13))
    const oreNoise = createNoise3D(this.makeRng(this.seed + 14))
    const scatterRng = this.makeRng(this.seed + 20)

    const heightAt = (x: number, z: number, biome: BiomeDef): number => {
      const base = biome.type === 'ocean' ? 7 : biome.type === 'desert' ? 14 : 14
      const amp = biome.type === 'plains' ? 4 : biome.type === 'forest' ? 6 : 8
      const scale = 0.04
      const h1 = heightNoise(x * scale, z * scale) * amp
      const h2 = detailNoise(x * scale * 2.1, z * scale * 2.1) * 2.5
      let h = Math.max(1, Math.floor(base + h1 + h2))
      if (biome.type === 'ocean') h = Math.min(h, WATER_LEVEL - 1)
      return h
    }

    // First pass: terrain columns.
    for (let x = 0; x < WORLD_SIZE_X; x++) {
      for (let z = 0; z < WORLD_SIZE_Z; z++) {
        const biome = BIOMES[this.getBiome(x, z)]
        const h = heightAt(x, z, biome)
        for (let y = 0; y <= h; y++) {
          let type: BlockType = 'stone'
          if (y === 0) {
            type = 'bedrock'
          } else if (y === h) {
            // Surface block
            if (h < WATER_LEVEL) {
              type = biome.surface === 'grass' ? 'dirt' : biome.surface // underwater: dirt for grass biomes
            } else {
              type = biome.surface
            }
            // Snow biome: snow on top, dirt below
            if (biome.hasSnow && h >= WATER_LEVEL) type = 'snow'
          } else if (y >= h - 3) {
            type = biome.subsurface
            if (biome.hasSnow && y >= h - 1) type = 'dirt' // dirt under snow
          } else {
            type = 'stone'
            // Ore veins via 3D noise thresholding.
            const oreN = oreNoise(x * 0.1, y * 0.15, z * 0.1)
            if (y < 4 && oreN > 0.78) type = 'diamond'
            else if (y < 10 && oreN > 0.7) type = 'gold'
            else if (y < 20 && oreNoise(x * 0.15, y * 0.2, z * 0.15) > 0.65) type = 'iron_ore'
            else if (oreNoise(x * 0.2, y * 0.25, z * 0.2) > 0.6) type = 'coal_ore'
          }
          // Carve caves: two overlapping 3D noise fields. Caves only below surface
          // and above bedrock, and never under oceans (so we don't flood the world).
          if (y > 1 && y < h - 1 && biome.type !== 'ocean') {
            const c1 = caveNoise(x * 0.08, y * 0.1, z * 0.08)
            const c2 = caveNoise2(x * 0.05, y * 0.06, z * 0.05)
            // Tunnels: where both noises are near zero (worm-like).
            if (Math.abs(c1) < 0.07 && Math.abs(c2) < 0.15) {
              type = 'air'
            }
            // Larger caverns: where one noise exceeds a high threshold.
            if (c1 > 0.85 && y < h - 4) {
              type = 'air'
            }
          }
          this.setBlock(x, y, z, type)
        }
        // Water fill
        if (h < WATER_LEVEL) {
          for (let y = h + 1; y <= WATER_LEVEL; y++) {
            this.setBlock(x, y, z, biome.hasSnow ? 'ice' : 'water')
          }
        }
      }
    }

    // Second pass: scatter trees, cacti, flowers.
    for (let x = 3; x < WORLD_SIZE_X - 3; x++) {
      for (let z = 3; z < WORLD_SIZE_Z - 3; z++) {
        const biome = BIOMES[this.getBiome(x, z)]
        const r = scatterRng()
        // Find surface
        let surfY = -1
        for (let y = WORLD_SIZE_Y - 1; y >= 0; y--) {
          const b = this.getBlock(x, y, z)
          if (b === 'air' || b === 'water' || b === 'ice') continue
          surfY = y
          break
        }
        if (surfY < 0) continue
        if (surfY < WATER_LEVEL) continue // Don't plant in water
        const surfBlock = this.getBlock(x, surfY, z)
        if (r < biome.treeChance && (surfBlock === 'grass' || surfBlock === 'snow')) {
          this.plantTree(x, surfY + 1, z, biome.type === 'snow')
        } else if (r < biome.treeChance + biome.cactusChance && surfBlock === 'sand') {
          // Cactus: 1-3 blocks tall
          const ch = 1 + Math.floor(scatterRng() * 3)
          for (let i = 1; i <= ch; i++) this.setBlock(x, surfY + i, z, 'cactus')
        } else if (r < biome.treeChance + biome.cactusChance + biome.flowerChance && surfBlock === 'grass') {
          this.setBlock(x, surfY + 1, z, scatterRng() < 0.5 ? 'flower_red' : 'flower_yellow')
        }
      }
    }
  }

  private plantTree(x: number, y: number, z: number, snowBiome: boolean): void {
    const trunkH = 4 + Math.floor(Math.random() * 2)
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
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && Math.random() < 0.6) continue
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

  // ----- Chunk meshing (unchanged from previous version) -----

  private rebuildChunk(scene: THREE.Scene, cx: number, cz: number): void {
    const i = cx + cz * CHUNKS_X
    const oldOpaque = this.chunkOpaqueMeshes[i]
    const oldCut = this.chunkCutoutMeshes[i]
    const oldTrans = this.chunkTranslucentMeshes[i]
    if (oldOpaque) { scene.remove(oldOpaque); oldOpaque.geometry.dispose(); this.chunkOpaqueMeshes[i] = null }
    if (oldCut) { scene.remove(oldCut); oldCut.geometry.dispose(); this.chunkCutoutMeshes[i] = null }
    if (oldTrans) { scene.remove(oldTrans); oldTrans.geometry.dispose(); this.chunkTranslucentMeshes[i] = null }

    const opaque = this.buildChunkGeometry(cx, cz, 'opaque')
    const cutout = this.buildChunkGeometry(cx, cz, 'cutout')
    const translucent = this.buildChunkGeometry(cx, cz, 'translucent')

    if (opaque) {
      const mesh = new THREE.Mesh(opaque, this.opaqueMaterial)
      mesh.name = `chunk_opaque_${cx}_${cz}`
      this.chunkOpaqueMeshes[i] = mesh
      scene.add(mesh)
    }
    if (cutout) {
      const mesh = new THREE.Mesh(cutout, this.cutoutMaterial)
      mesh.name = `chunk_cutout_${cx}_${cz}`
      mesh.renderOrder = 1
      this.chunkCutoutMeshes[i] = mesh
      scene.add(mesh)
    }
    if (translucent) {
      const mesh = new THREE.Mesh(translucent, this.translucentMaterial)
      mesh.name = `chunk_trans_${cx}_${cz}`
      mesh.renderOrder = 2
      this.chunkTranslucentMeshes[i] = mesh
      scene.add(mesh)
    }
  }

  private buildChunkGeometry(cx: number, cz: number, pass: 'opaque' | 'cutout' | 'translucent'): THREE.BufferGeometry | null {
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const colors: number[] = []

    const x0 = cx * CHUNK_SIZE
    const z0 = cz * CHUNK_SIZE

    const FACE_CORNERS: Record<number, [number, number, number][]> = {
      0: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
      2: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
      1: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
      3: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]],
      4: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]],
      5: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    }
    const FACE_DEFS = [
      { dir: [0, 1, 0] as const, n: [0, 1, 0] as const, faceKind: 0, corners: FACE_CORNERS[0] },
      { dir: [0, -1, 0] as const, n: [0, -1, 0] as const, faceKind: 2, corners: FACE_CORNERS[2] },
      { dir: [1, 0, 0] as const, n: [1, 0, 0] as const, faceKind: 1, corners: FACE_CORNERS[1] },
      { dir: [-1, 0, 0] as const, n: [-1, 0, 0] as const, faceKind: 1, corners: FACE_CORNERS[3] },
      { dir: [0, 0, 1] as const, n: [0, 0, 1] as const, faceKind: 1, corners: FACE_CORNERS[4] },
      { dir: [0, 0, -1] as const, n: [0, 0, -1] as const, faceKind: 1, corners: FACE_CORNERS[5] },
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
          const isTranslucent = !!def.translucent
          const isCutout = !!def.transparent && !isTranslucent
          if (pass === 'opaque' && def.transparent) continue
          if (pass === 'cutout' && !isCutout) continue
          if (pass === 'translucent' && !isTranslucent) continue

          // Cross-shaped blocks (flowers, cactus, ladder) only render on +X/-X/+Z/-Z faces.
          const isCross = !!def.cross
          // Slab: only renders top face at y+0.5 (handled separately below).
          const isSlab = !!def.slab

          for (const face of FACE_DEFS) {
            // Cross blocks: skip top and bottom faces.
            if (isCross && face.faceKind !== 1) continue
            const nb = this.getBlockForCulling(wx + face.dir[0], ly + face.dir[1], wz + face.dir[2])
            if (nb === block) continue
            if (nb !== 'air') {
              const nbDef = BLOCKS[nb]
              const nbTranslucent = !!nbDef.translucent
              const nbCutout = !!nbDef.transparent && !nbTranslucent
              const nbOpaque = !nbDef.transparent
              if (pass === 'opaque' && nbOpaque) continue
              if (pass === 'cutout' && nbCutout) continue
              if (pass === 'translucent' && nbTranslucent) continue
            }
            const tile = def.tiles[face.faceKind]
            const [u0, v0, u1, v1] = tileUV(tile)
            const shade = face.faceKind === 0 ? 1.0 : face.faceKind === 2 ? 0.55 : 0.8
            const r = shade, g = shade, b = shade

            if (isCross) {
              // Diagonal X-shaped plant (flowers, cactus). Two crossed quads.
              this.pushCrossFace(positions, normals, uvs, colors, wx, ly, wz, u0, v0, u1, v1, r, g, b)
              hasGeometry = true
              continue
            }
            if (isSlab) {
              // Slab occupies bottom half. Move top face down to y+0.5.
              this.pushSlabFace(positions, normals, uvs, colors, face, wx, ly, wz, u0, v0, u1, v1, r, g, b)
              hasGeometry = true
              continue
            }

            for (const c of face.corners) {
              positions.push(wx + c[0], ly + c[1], wz + c[2])
              normals.push(face.n[0], face.n[1], face.n[2])
              colors.push(r, g, b)
            }
            uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)
            hasGeometry = true
          }
        }
      }
    }

    if (!hasGeometry) return null

    const faceCount = positions.length / 3 / 4
    const indices = new Uint32Array(faceCount * 6)
    // NOTE: index winding is (0,2,1)(0,3,2) — REVERSED from the naive (0,1,2)(0,2,3).
    // The FACE_CORNERS arrays are stored in an order whose right-hand-rule normal points
    // INWARD (opposite to the declared outward normal in FACE_DEFS). With the opaque
    // material using the default THREE.FrontSide, the naive winding would cull every
    // outward-facing side, making opaque blocks appear see-through. Reversing the index
    // order flips the winding so the outward face is the front face (rendered), while
    // leaving UV-to-corner mapping intact (so textures are not mirrored). This single
    // index change fixes regular quads, pushCrossFace quads, and pushSlabFace quads.
    for (let f = 0; f < faceCount; f++) {
      const o = f * 4
      indices[f * 6 + 0] = o + 0
      indices[f * 6 + 1] = o + 2
      indices[f * 6 + 2] = o + 1
      indices[f * 6 + 3] = o + 0
      indices[f * 6 + 4] = o + 3
      indices[f * 6 + 5] = o + 2
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    geo.computeBoundingSphere()
    return geo
  }

  /** Push two vertical diagonal quads for X-shaped plant blocks (flowers, etc.).
   *  The quads stand upright (vertical) and cross each other in an X when
   *  viewed from above, mimicking Minecraft's flower rendering. */
  private pushCrossFace(positions: number[], normals: number[], uvs: number[], colors: number[],
                        wx: number, ly: number, wz: number,
                        u0: number, v0: number, u1: number, v1: number,
                        r: number, g: number, b: number): void {
    // Quad 1: vertical plane along diagonal from (0,0,0)->(1,0,1)
    // Corners: bottom-back, bottom-front, top-front, top-back
    const corners1: [number, number, number][] = [
      [0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0],
    ]
    // Quad 2: vertical plane along the other diagonal (0,0,1)->(1,0,0)
    const corners2: [number, number, number][] = [
      [0, 0, 1], [1, 0, 0], [1, 1, 0], [0, 1, 1],
    ]
    for (const corners of [corners1, corners2]) {
      for (const c of corners) {
        positions.push(wx + c[0], ly + c[1], wz + c[2])
        normals.push(0, 1, 0) // approximate up-facing normal for lighting
        colors.push(r, g, b)
      }
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)
    }
  }

  /** Push a face for a slab (half-height block). */
  private pushSlabFace(positions: number[], normals: number[], uvs: number[], colors: number[],
                       face: { dir: readonly number[]; n: readonly number[]; faceKind: number; corners: [number, number, number][] },
                       wx: number, ly: number, wz: number,
                       u0: number, v0: number, u1: number, v1: number,
                       r: number, g: number, b: number): void {
    // For top face (faceKind 0), the corners already start at y=1 — we want y=0.5.
    // For side faces, we want to lower the top two corners from y=1 to y=0.5.
    // For bottom face, keep as is (already at y=0).
    for (const c of face.corners) {
      let y = c[1]
      if (face.faceKind === 0) y = 0.5 // top face: lower from 1 to 0.5
      else if (face.faceKind === 1 && y === 1) y = 0.5 // side face top edge
      positions.push(wx + c[0], ly + y, wz + c[2])
      normals.push(face.n[0], face.n[1], face.n[2])
      colors.push(r, g, b)
    }
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)
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
      // Skip air, water, and non-collidable decoration blocks (flowers, ladder).
      if (block !== 'air' && block !== 'water' && block !== 'flower_red' && block !== 'flower_yellow' && block !== 'ladder') {
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

  /** Finds the highest non-air block at (x, z). Returns -1 if column is empty. */
  highestBlockY(x: number, z: number): number {
    for (let y = WORLD_SIZE_Y - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z)
      if (b !== 'air' && b !== 'water' && b !== 'ice' && b !== 'flower_red' && b !== 'flower_yellow') return y
    }
    return -1
  }
}

// Suppress unused import warnings (these are used downstream).
export { ATLAS_COLS, ATLAS_ROWS, TILE_SIZE, isTransparent }
