// World data, terrain generation, and chunk meshing for the voxel game.

import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'
import { BLOCKS, BlockType, isTransparent } from './blocks'
import { tileUV, ATLAS_COLS, ATLAS_ROWS, TILE_SIZE } from './textures'

// Block integer IDs (stored in the world array for performance).
const BLOCK_IDS: BlockType[] = [
  'air', 'grass', 'dirt', 'stone', 'wood', 'leaves', 'sand', 'water',
  'planks', 'cobblestone', 'bedrock', 'glass', 'brick', 'gold', 'diamond',
]
const ID_TO_TYPE = new Map<number, BlockType>()
const TYPE_TO_ID = new Map<BlockType, number>()
BLOCK_IDS.forEach((t, i) => {
  ID_TO_TYPE.set(i, t)
  TYPE_TO_ID.set(t, i)
})

export const WORLD_SIZE_X = 64
export const WORLD_SIZE_Y = 40
export const WORLD_SIZE_Z = 64
export const WATER_LEVEL = 10

const CHUNK_SIZE = 16
const CHUNKS_X = WORLD_SIZE_X / CHUNK_SIZE
const CHUNKS_Z = WORLD_SIZE_Z / CHUNK_SIZE

function idx(x: number, y: number, z: number): number {
  return x + z * WORLD_SIZE_X + y * WORLD_SIZE_X * WORLD_SIZE_Z
}

export class World {
  /** Flat array of block IDs (0 = air). */
  data: Uint8Array
  /** One opaque mesh + one transparent mesh per chunk. */
  chunkOpaqueMeshes: (THREE.Mesh | null)[]
  chunkTransparentMeshes: (THREE.Mesh | null)[]
  /** Shared geometry & material. */
  private opaqueMaterial: THREE.Material
  private transparentMaterial: THREE.Material

  constructor(scene: THREE.Scene, atlasTexture: THREE.Texture) {
    this.data = new Uint8Array(WORLD_SIZE_X * WORLD_SIZE_Y * WORLD_SIZE_Z)
    this.chunkOpaqueMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null)
    this.chunkTransparentMeshes = new Array(CHUNKS_X * CHUNKS_Z).fill(null)

    this.opaqueMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      alphaTest: 0.1,
    })
    this.transparentMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    })

    this.generate()

    // Build initial chunk meshes.
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

  /** Get block, treating out-of-bounds Y>top as air (so top faces of the world render). */
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

  /** Set a block and rebuild affected chunks. Returns the chunk coords rebuilt. */
  setBlockAndUpdate(scene: THREE.Scene, x: number, y: number, z: number, type: BlockType): void {
    if (!this.setBlock(x, y, z, type)) return
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    this.rebuildChunk(scene, cx, cz)
    // Rebuild neighbor chunk if the block is on a chunk boundary.
    const lx = x - cx * CHUNK_SIZE
    const lz = z - cz * CHUNK_SIZE
    if (lx === 0 && cx > 0) this.rebuildChunk(scene, cx - 1, cz)
    if (lx === CHUNK_SIZE - 1 && cx < CHUNKS_X - 1) this.rebuildChunk(scene, cx + 1, cz)
    if (lz === 0 && cz > 0) this.rebuildChunk(scene, cx, cz - 1)
    if (lz === CHUNK_SIZE - 1 && cz < CHUNKS_Z - 1) this.rebuildChunk(scene, cx, cz + 1)
  }

  // ----- Terrain generation -----

  private generate(): void {
    const noise2D = createNoise2D(() => 0.42) // deterministic-ish noise
    const noise2DDetail = createNoise2D(() => 0.31)
    const treeNoise = createNoise2D(() => 0.55)

    const heightAt = (x: number, z: number): number => {
      const base = 12
      const amp = 8
      const scale = 0.045
      const h1 = noise2D(x * scale, z * scale) * amp
      const h2 = noise2DDetail(x * scale * 2.1, z * scale * 2.1) * 3
      return Math.max(1, Math.floor(base + h1 + h2))
    }

    for (let x = 0; x < WORLD_SIZE_X; x++) {
      for (let z = 0; z < WORLD_SIZE_Z; z++) {
        const h = heightAt(x, z)
        for (let y = 0; y <= h; y++) {
          let type: BlockType = 'stone'
          if (y === 0) {
            type = 'bedrock'
          } else if (y === h) {
            // Surface block
            if (h <= WATER_LEVEL) {
              type = 'sand'
            } else if (h <= WATER_LEVEL + 1) {
              type = 'sand'
            } else {
              type = 'grass'
            }
          } else if (y >= h - 3) {
            // Subsurface
            if (h <= WATER_LEVEL + 1) {
              type = 'sand'
            } else {
              type = 'dirt'
            }
          } else {
            type = 'stone'
            // Sparse ores deep down
            if (y < 6 && Math.random() < 0.02) {
              type = Math.random() < 0.5 ? 'gold' : 'diamond'
            }
          }
          this.setBlock(x, y, z, type)
        }
        // Fill water above terrain up to water level
        if (h < WATER_LEVEL) {
          for (let y = h + 1; y <= WATER_LEVEL; y++) {
            this.setBlock(x, y, z, 'water')
          }
        }
      }
    }

    // Scatter trees on grass surfaces (deterministic via noise + hash).
    for (let x = 4; x < WORLD_SIZE_X - 4; x++) {
      for (let z = 4; z < WORLD_SIZE_Z - 4; z++) {
        // Pseudo-random per column using tree noise.
        const n = treeNoise(x * 0.7, z * 0.7)
        const hash = ((x * 73856093) ^ (z * 19349663)) >>> 0
        const r = (hash / 0xffffffff + (n + 1) * 0.5) % 1
        if (r < 0.04) {
          // Find surface height
          let surfY = -1
          for (let y = WORLD_SIZE_Y - 1; y >= 0; y--) {
            const b = this.getBlock(x, y, z)
            if (b === 'grass') { surfY = y; break }
            if (b !== 'air' && b !== 'water') break
          }
          if (surfY >= WATER_LEVEL + 1) {
            this.plantTree(x, surfY + 1, z)
          }
        }
      }
    }
  }

  private plantTree(x: number, y: number, z: number): void {
    const trunkH = 4 + Math.floor(Math.random() * 2)
    // Trunk
    for (let i = 0; i < trunkH; i++) {
      this.setBlock(x, y + i, z, 'wood')
    }
    // Leaves canopy (3 layers)
    const topY = y + trunkH
    for (let dy = -1; dy <= 1; dy++) {
      const ly = topY + dy
      const radius = dy === 1 ? 1 : 2
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue
          // Trim corners on outer layer for rounder shape.
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && Math.random() < 0.6) continue
          const lx = x + dx
          const lz = z + dz
          if (this.getBlock(lx, ly, lz) === 'air') {
            this.setBlock(lx, ly, lz, 'leaves')
          }
        }
      }
    }
    // Top leaf
    this.setBlock(x, topY + 1, z, 'leaves')
  }

  // ----- Chunk meshing -----

  private rebuildChunk(scene: THREE.Scene, cx: number, cz: number): void {
    const i = cx + cz * CHUNKS_X
    // Remove old meshes.
    const oldOpaque = this.chunkOpaqueMeshes[i]
    const oldTrans = this.chunkTransparentMeshes[i]
    if (oldOpaque) {
      scene.remove(oldOpaque)
      oldOpaque.geometry.dispose()
      this.chunkOpaqueMeshes[i] = null
    }
    if (oldTrans) {
      scene.remove(oldTrans)
      oldTrans.geometry.dispose()
      this.chunkTransparentMeshes[i] = null
    }

    // Build geometry by walking all blocks in the chunk.
    const opaque = this.buildChunkGeometry(cx, cz, false)
    const transparent = this.buildChunkGeometry(cx, cz, true)

    if (opaque) {
      const mesh = new THREE.Mesh(opaque, this.opaqueMaterial)
      mesh.name = `chunk_opaque_${cx}_${cz}`
      this.chunkOpaqueMeshes[i] = mesh
      scene.add(mesh)
    }
    if (transparent) {
      const mesh = new THREE.Mesh(transparent, this.transparentMaterial)
      mesh.name = `chunk_trans_${cx}_${cz}`
      mesh.renderOrder = 1
      this.chunkTransparentMeshes[i] = mesh
      scene.add(mesh)
    }
  }

  private buildChunkGeometry(cx: number, cz: number, transparentPass: boolean): THREE.BufferGeometry | null {
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const colors: number[] = []

    const x0 = cx * CHUNK_SIZE
    const z0 = cz * CHUNK_SIZE

    // Face definitions: [dx, dy, dz, nx, ny, nz, faceIndex]
    // faceIndex: 0=top, 1=side, 2=bottom — used to pick the tile from BLOCKS[t].tiles
    const FACES = [
      // +Y (top)
      { dir: [0, 1, 0], n: [0, 1, 0], faceKind: 0 },
      // -Y (bottom)
      { dir: [0, -1, 0], n: [0, -1, 0], faceKind: 2 },
      // +X (east)
      { dir: [1, 0, 0], n: [1, 0, 0], faceKind: 1 },
      // -X (west)
      { dir: [-1, 0, 0], n: [-1, 0, 0], faceKind: 1 },
      // +Z (south)
      { dir: [0, 0, 1], n: [0, 0, 1], faceKind: 1 },
      // -Z (north)
      { dir: [0, 0, -1], n: [0, 0, -1], faceKind: 1 },
    ] as const

    // For each face, the 4 corner offsets (relative to block origin) in order: [bl, br, tr, tl]
    const FACE_CORNERS: Record<number, [number, number, number][]> = {
      // +Y top
      0: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
      // -Y bottom
      2: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
      // +X east
      1: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
      // -X west (faceKind=1 but we use separate direction check)
      3: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]],
      // +Z south
      4: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]],
      // -Z north
      5: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    }

    // Map faceKind back to face index for corner lookup.
    // Build a lookup: for each FACES entry, store its own corner set.
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
          const isTransparentBlock = !!def.transparent
          if (transparentPass !== isTransparentBlock) continue

          for (const face of FACE_DEFS) {
            const nb = this.getBlockForCulling(wx + face.dir[0], ly + face.dir[1], wz + face.dir[2])
            // Cull rule: don't render face if neighbor is opaque (same pass).
            // For transparent blocks, also don't render between two of the same type (e.g. water-water).
            if (!isTransparent(nb)) continue
            if (isTransparentBlock && nb === block) continue

            const tile = def.tiles[face.faceKind]
            const [u0, v0, u1, v1] = tileUV(tile)

            // Per-face shading for visual depth (no real lighting needed).
            const shade = face.faceKind === 0 ? 1.0 : face.faceKind === 2 ? 0.55 : 0.8
            const r = shade
            const g = shade
            const b = shade

            const base = positions.length / 3
            for (const c of face.corners) {
              positions.push(wx + c[0], ly + c[1], wz + c[2])
              normals.push(face.n[0], face.n[1], face.n[2])
              colors.push(r, g, b)
            }
            // UVs: bl, br, tr, tl  ->  (u0,v0),(u1,v0),(u1,v1),(u0,v1)
            uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)

            // Two triangles: base, base+1, base+2  and  base, base+2, base+3
            // We use non-indexed geometry for simplicity (push 6 vertices via duplication).
            // Already pushed 4 vertices; we need 6. So duplicate by re-pushing corners.
            // Switch to indexed instead for efficiency:
            // (we'll convert below)
            hasGeometry = true
            // Add indices later — for now duplicate vertices.
          }
        }
      }
    }

    if (!hasGeometry) return null

    // We pushed 4 vertices per face. Convert to indexed geometry.
    // Re-walk: we'll build a new positions array as non-indexed (6 verts per face).
    // Simpler approach: rebuild as non-indexed. But the loop above already pushed 4 verts/face.
    // Let's instead build the index buffer.
    // Count faces = positions.length / 3 / 4
    const faceCount = positions.length / 3 / 4
    const indices = new Uint32Array(faceCount * 6)
    for (let f = 0; f < faceCount; f++) {
      const o = f * 4
      indices[f * 6 + 0] = o + 0
      indices[f * 6 + 1] = o + 1
      indices[f * 6 + 2] = o + 2
      indices[f * 6 + 3] = o + 0
      indices[f * 6 + 4] = o + 2
      indices[f * 6 + 5] = o + 3
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
      if (block !== 'air' && block !== 'water') {
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
      if (b !== 'air' && b !== 'water') return y
    }
    return -1
  }
}

// Suppress unused import warnings (these are used downstream).
export { ATLAS_COLS, ATLAS_ROWS, TILE_SIZE }
