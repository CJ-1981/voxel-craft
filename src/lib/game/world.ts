// World data, terrain generation, chunk meshing, and persistence for the voxel game.

import * as THREE from 'three'
import { createNoise2D, createNoise3D } from 'simplex-noise'
import { BLOCKS, BlockType, isTransparent } from './blocks'
import { tileUV, ATLAS_COLS, ATLAS_ROWS, TILE_SIZE } from './textures'
import { buildDungeon, buildDesertPyramid, buildLavaLake } from './structures'
import type { Slot } from './inventory'

// Block integer IDs (stored in the world array for performance).
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

export const WORLD_SIZE_X = 208
export const WORLD_SIZE_Y = 48
export const WORLD_SIZE_Z = 208
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
const SAVE_CHESTS_KEY = 'voxelcraft_chests_v1'

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

  /** Storage for chest inventories keyed by `${x},${y},${z}`. */
  private chests: Map<string, Slot[]> = new Map()

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

    // Lazy meshing: mesh only the spawn-area 3×3 chunks immediately; defer
    // the rest to the game loop (meshDirtyChunks) to avoid freezing on load.
    this.dirtyChunks = []
    const ccx = Math.floor(CHUNKS_X / 2)
    const ccz = Math.floor(CHUNKS_Z / 2)
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const isNearSpawn = Math.abs(cx - ccx) <= 1 && Math.abs(cz - ccz) <= 1
        if (isNearSpawn) {
          this.rebuildChunk(scene, cx, cz)
        } else {
          this.dirtyChunks.push([cx, cz])
        }
      }
    }
    this.dirtyChunks.sort((a, b) => {
      const da = (a[0] - ccx) ** 2 + (a[1] - ccz) ** 2
      const db = (b[0] - ccx) ** 2 + (b[1] - ccz) ** 2
      return da - db
    })
  }

  /** Chunks that need (re)meshing, queued as [cx, cz] pairs. */
  private dirtyChunks: [number, number][] = []

  /** Mesh up to `budget` dirty chunks per frame. */
  meshDirtyChunks(scene: THREE.Scene, budget: number): number {
    let count = 0
    while (this.dirtyChunks.length > 0 && count < budget) {
      const [cx, cz] = this.dirtyChunks.shift()!
      this.rebuildChunk(scene, cx, cz)
      count++
    }
    return count
  }

  get isMeshing(): boolean { return this.dirtyChunks.length > 0 }
  get meshProgress(): number {
    const total = CHUNKS_X * CHUNKS_Z
    return (total - this.dirtyChunks.length) / total
  }

  markChunkDirty(cx: number, cz: number): void {
    for (const [dx, dz] of this.dirtyChunks) {
      if (dx === cx && dz === cz) return
    }
    this.dirtyChunks.push([cx, cz])
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
          const cx = Math.floor(nx / CHUNK_SIZE)
          const cz = Math.floor(nz / CHUNK_SIZE)
          this.markChunkDirty(cx, cz)
        }
      }
    }

    if (!this.setBlock(x, y, z, finalType)) return
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

  // ----- Chest Storage -----

  getChestLoot(x: number, y: number, z: number): Slot[] | undefined {
    return this.chests.get(`${x},${y},${z}`)
  }

  setChestLoot(x: number, y: number, z: number, slots: Slot[]): void {
    this.chests.set(`${x},${y},${z}`, slots)
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
      localStorage.setItem(SAVE_CHESTS_KEY, JSON.stringify(Array.from(this.chests.entries())))
      return true
    } catch (e) {
      console.warn('World save failed:', e)
      return false
    }
  }

  static hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY)
    } catch {
      return false
    }
  }

  static loadMeta(): WorldSaveMeta | null {
    try {
      const raw = localStorage.getItem(SAVE_META_KEY)
      if (!raw) return null
      return JSON.parse(raw) as WorldSaveMeta
    } catch {
      return null
    }
  }

  load(scene: THREE.Scene): boolean {
    try {
      const b64 = localStorage.getItem(SAVE_KEY)
      if (!b64) return false
      const bin = atob(b64)
      if (bin.length !== this.data.length) return false
      for (let i = 0; i < bin.length; i++) {
        this.data[i] = bin.charCodeAt(i)
      }
      const chestsRaw = localStorage.getItem(SAVE_CHESTS_KEY)
      if (chestsRaw) {
        this.chests = new Map(JSON.parse(chestsRaw))
      }
      for (let cz = 0; cz < CHUNKS_Z; cz++) {
        for (let cx = 0; cx < CHUNKS_X; cx++) {
          this.rebuildChunk(scene, cx, cz)
        }
      }
      return true
    } catch (e) {
      console.warn('World load failed:', e)
      return false
    }
  }

  loadFromSave(scene: THREE.Scene): boolean {
    return this.load(scene)
  }

  static clearSave(): void {
    try {
      localStorage.removeItem(SAVE_KEY)
      localStorage.removeItem(SAVE_META_KEY)
      localStorage.removeItem(SAVE_CHESTS_KEY)
    } catch (e) {
      console.warn('Clear save failed:', e)
    }
  }

  // ----- Terrain Generation -----

  private generate(): void {
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

    const terrainNoise1 = createNoise2D(rng)
    const terrainNoise2 = createNoise2D(rng)
    const terrainNoise3 = createNoise2D(rng)
    const biomeNoiseTemp = createNoise2D(rng)
    const biomeNoiseRain = createNoise2D(rng)
    const caveNoise = createNoise3D(rng)
    const caveNoise2 = createNoise3D(rng)
    const oreNoiseCoal = createNoise3D(rng)
    const oreNoiseIron = createNoise3D(rng)
    const oreNoiseGold = createNoise3D(rng)
    const oreNoiseDia = createNoise3D(rng)
    const scatterRng = sfc32(s + 1, s ^ 0x55555555, s ^ 0xaaaaaaaa, s ^ 0x33333333)

    // First pass: terrain height & biomes
    for (let x = 0; x < WORLD_SIZE_X; x++) {
      for (let z = 0; z < WORLD_SIZE_Z; z++) {
        const temp = biomeNoiseTemp(x * 0.005, z * 0.005)
        const rain = biomeNoiseRain(x * 0.005, z * 0.005)

        let biomeType: BiomeType
        if (rain < -0.35) {
          biomeType = 'desert'
        } else if (temp < -0.3) {
          biomeType = 'snow'
        } else if (rain > 0.3) {
          biomeType = 'forest'
        } else if (temp > 0.4 && rain < 0) {
          biomeType = 'desert'
        } else {
          biomeType = 'plains'
        }

        const biomeId = ['plains', 'forest', 'desert', 'snow', 'ocean'].indexOf(biomeType)
        this.biomes[x + z * WORLD_SIZE_X] = biomeId
        const biome = BIOMES[biomeType]

        const n1 = terrainNoise1(x * 0.015, z * 0.015)
        const n2 = terrainNoise2(x * 0.04, z * 0.04) * 0.4
        const n3 = terrainNoise3(x * 0.1, z * 0.1) * 0.15
        const elevation = (n1 + n2 + n3) * 0.5 + 0.5

        let h: number
        if (biomeType === 'ocean') {
          h = Math.floor(6 + elevation * 5)
        } else if (biomeType === 'snow') {
          h = Math.floor(16 + elevation * 20)
        } else if (biomeType === 'desert') {
          h = Math.floor(13 + elevation * 10)
        } else {
          h = Math.floor(12 + elevation * 15)
        }
        h = Math.max(1, Math.min(WORLD_SIZE_Y - 2, h))

        for (let y = 0; y <= h; y++) {
          let type: BlockType
          if (y === 0) {
            type = 'bedrock'
          } else if (y === h) {
            type = h < WATER_LEVEL ? 'sand' : biome.surface
          } else if (y >= h - 3) {
            type = h < WATER_LEVEL ? 'sand' : biome.subsurface
          } else {
            type = 'stone'
            if (oreNoiseDia(x * 0.15, y * 0.15, z * 0.15) > 0.78 && y < 8) type = 'diamond'
            else if (oreNoiseGold(x * 0.12, y * 0.12, z * 0.12) > 0.72 && y < 14) type = 'gold'
            else if (oreNoiseIron(x * 0.1, y * 0.1, z * 0.1) > 0.65 && y < 24) type = 'iron_ore'
            else if (oreNoiseCoal(x * 0.08, y * 0.08, z * 0.08) > 0.62) type = 'coal_ore'
          }

          // Carve caves
          if (y > 1 && y < h - 1 && biome.type !== 'ocean') {
            const c1 = caveNoise(x * 0.08, y * 0.1, z * 0.08)
            const c2 = caveNoise2(x * 0.05, y * 0.06, z * 0.05)
            if (Math.abs(c1) < 0.07 && Math.abs(c2) < 0.15) type = 'air'
            if (c1 > 0.85 && y < h - 4) type = 'air'
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
        let surfY = -1
        for (let y = WORLD_SIZE_Y - 1; y >= 0; y--) {
          const b = this.getBlock(x, y, z)
          if (b === 'air' || b === 'water' || b === 'ice') continue
          surfY = y
          break
        }
        if (surfY < 0 || surfY < WATER_LEVEL) continue

        const surfBlock = this.getBlock(x, surfY, z)
        if (r < biome.treeChance && (surfBlock === 'grass' || surfBlock === 'snow')) {
          this.plantTree(x, surfY + 1, z, biome.type === 'snow')
        } else if (r < biome.treeChance + biome.cactusChance && surfBlock === 'sand') {
          const ch = 1 + Math.floor(scatterRng() * 3)
          for (let i = 1; i <= ch; i++) this.setBlock(x, surfY + i, z, 'cactus')
        } else if (r < biome.treeChance + biome.cactusChance + biome.flowerChance && surfBlock === 'grass') {
          this.setBlock(x, surfY + 1, z, scatterRng() < 0.5 ? 'flower_red' : 'flower_yellow')
        }
      }
    }

    // Third pass: Natural Structures (Dungeons, Desert Pyramids, Lava Lakes)
    // 1. Natural Underground Dungeons
    for (let d = 0; d < 4; d++) {
      const dx = 25 + Math.floor(scatterRng() * (WORLD_SIZE_X - 50))
      const dz = 25 + Math.floor(scatterRng() * (WORLD_SIZE_Z - 50))
      const dy = 5 + Math.floor(scatterRng() * 10) // deep underground
      buildDungeon(this, dx, dy, dz)
    }

    // 2. Desert Pyramids
    let pyramidsBuilt = 0
    for (let px = 30; px < WORLD_SIZE_X - 30; px += 25) {
      for (let pz = 30; pz < WORLD_SIZE_Z - 30; pz += 25) {
        if (this.getBiome(px, pz) === 'desert' && pyramidsBuilt < 2) {
          buildDesertPyramid(this, px, pz)
          pyramidsBuilt++
        }
      }
    }

    // 3. Lava Lakes in caves
    for (let l = 0; l < 4; l++) {
      const lx = 20 + Math.floor(scatterRng() * (WORLD_SIZE_X - 40))
      const lz = 20 + Math.floor(scatterRng() * (WORLD_SIZE_Z - 40))
      const ly = 4 + Math.floor(scatterRng() * 6)
      buildLavaLake(this, lx, ly, lz, 3)
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

  // ----- Chunk meshing -----

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

  /** Finds the highest non-air block at (x, z). Returns -1 if column is empty. */
  highestBlockY(x: number, z: number): number {
    for (let y = WORLD_SIZE_Y - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z)
      if (b !== 'air' && b !== 'water' && b !== 'ice' && b !== 'flower_red' && b !== 'flower_yellow') return y
    }
    return -1
  }
}

export { ATLAS_COLS, ATLAS_ROWS, TILE_SIZE, isTransparent }
