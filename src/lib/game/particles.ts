// Particle system: spawns textured cube particles when blocks are destroyed
// and colored cube particles when mobs are hit/killed, mimicking Minecraft's
// block-break and mob-death effects.

import * as THREE from 'three'
import { BLOCKS, BlockType } from './blocks'
import { tileUV } from './textures'

interface Particle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  angularVelocity: THREE.Vector3
  life: number
  maxLife: number
}

// Mob type colors for death particles.
const MOB_COLORS: Record<string, number> = {
  sheep: 0xeaeaea,   // white wool
  zombie: 0x4a7a3a,  // green skin
}

export class BreakParticles {
  private particles: Particle[] = []
  private scene: THREE.Scene
  private sharedGeometry: THREE.BoxGeometry
  private blockMaterials: Map<BlockType, { mat: THREE.MeshBasicMaterial; geo: THREE.BufferGeometry }> = new Map()
  private mobMaterials: Map<string, THREE.MeshBasicMaterial> = new Map()
  private atlas: THREE.Texture

  constructor(scene: THREE.Scene, atlas: THREE.Texture) {
    this.scene = scene
    this.atlas = atlas
    // Small cube geometry for particles (0.3 block units — clearly visible).
    this.sharedGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3)
  }

  /** Get (or create) a material+geometry pair for a block type — uses the
   *  block's side tile as the particle texture via UV adjustment on a cloned
   *  geometry. */
  private getBlockMaterial(block: BlockType): { mat: THREE.MeshBasicMaterial; geo: THREE.BufferGeometry } {
    if (this.blockMaterials.has(block)) return this.blockMaterials.get(block)!
    const def = BLOCKS[block]
    const tile = def.tiles[1]
    const [u0, v0, u1, v1] = tileUV(tile)
    const geo = this.sharedGeometry.clone()
    const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < 24; i += 4) {
      uvAttr.setXY(i + 0, u0, v0)
      uvAttr.setXY(i + 1, u1, v0)
      uvAttr.setXY(i + 2, u0, v1)
      uvAttr.setXY(i + 3, u1, v1)
    }
    uvAttr.needsUpdate = true
    geo.computeBoundingSphere()
    geo.computeBoundingBox()
    const mat = new THREE.MeshBasicMaterial({
      map: this.atlas,
      alphaTest: 0.5,
      transparent: false,
    })
    void def
    const entry = { mat, geo }
    this.blockMaterials.set(block, entry)
    return entry
  }

  /** Get (or create) a colored material for a mob type. */
  private getMobMaterial(mobType: string): THREE.MeshBasicMaterial {
    if (this.mobMaterials.has(mobType)) return this.mobMaterials.get(mobType)!
    const color = MOB_COLORS[mobType] ?? 0xcccccc
    const mat = new THREE.MeshBasicMaterial({ color })
    this.mobMaterials.set(mobType, mat)
    return mat
  }

  /** Spawn a burst of block-textured particles at the given block position. */
  spawn(blockType: BlockType, x: number, y: number, z: number, count = 12): void {
    if (blockType === 'air' || blockType === 'water') return
    const { mat, geo } = this.getBlockMaterial(blockType)
    this.spawnBurst(geo, mat, x + 0.5, y + 0.5, z + 0.5, count, 0.25)
  }

  /** Spawn a burst of colored particles when a mob is hit or killed.
   *  Uses the mob's body color so the debris matches the mob's appearance. */
  spawnMob(mobType: string, x: number, y: number, z: number, count = 14, killed = false): void {
    const mat = this.getMobMaterial(mobType)
    // More particles + bigger burst when killed vs just hit.
    const actualCount = killed ? count + 8 : count
    const spread = killed ? 0.4 : 0.2
    this.spawnBurst(this.sharedGeometry, mat, x, y, z, actualCount, spread, killed ? 4 : 2.5)
  }

  /** Internal: spawn `count` particles using the given geometry+material. */
  private spawnBurst(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    cx: number, cy: number, cz: number,
    count: number,
    spread: number,
    vyBoost = 2.5,
  ): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        cx + (Math.random() - 0.5) * spread * 2,
        cy + (Math.random() - 0.5) * spread * 2,
        cz + (Math.random() - 0.5) * spread * 2,
      )
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      )
      mesh.frustumCulled = false
      const angle = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 2.5
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed * 0.5,
        vyBoost + Math.random() * 2.5,
        Math.sin(angle) * speed * 0.5,
      )
      const angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
      )
      const life = 2.0 + Math.random() * 1.5
      this.particles.push({
        mesh, velocity: vel, angularVelocity: angVel,
        life, maxLife: life,
      })
      this.scene.add(mesh)
    }
  }

  /** Update all particles. Call every frame. */
  update(dt: number): void {
    dt = Math.min(dt, 0.1)
    const gravity = -14
    const dead: Particle[] = []
    for (const p of this.particles) {
      p.life -= dt
      if (p.life <= 0) {
        dead.push(p)
        continue
      }
      p.velocity.y += gravity * dt
      p.mesh.position.x += p.velocity.x * dt
      p.mesh.position.y += p.velocity.y * dt
      p.mesh.position.z += p.velocity.z * dt
      p.mesh.rotation.x += p.angularVelocity.x * dt
      p.mesh.rotation.y += p.angularVelocity.y * dt
      p.mesh.rotation.z += p.angularVelocity.z * dt
      const lifeRatio = p.life / p.maxLife
      if (lifeRatio < 0.3) {
        const scale = lifeRatio / 0.3
        p.mesh.scale.setScalar(Math.max(0.01, scale))
      }
    }
    for (const p of dead) {
      this.scene.remove(p.mesh)
      const i = this.particles.indexOf(p)
      if (i >= 0) this.particles.splice(i, 1)
    }
  }

  clear(): void {
    for (const p of this.particles) this.scene.remove(p.mesh)
    this.particles = []
  }

  get count(): number {
    return this.particles.length
  }

  dispose(): void {
    this.clear()
    this.sharedGeometry.dispose()
    for (const [, { mat, geo }] of this.blockMaterials) {
      geo.dispose()
      mat.dispose()
    }
    this.blockMaterials.clear()
    for (const [, mat] of this.mobMaterials) mat.dispose()
    this.mobMaterials.clear()
  }
}
