// Block-break particle system: spawns textured cube particles when a block
// is destroyed, mimicking Minecraft's block-break effect.

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

export class BreakParticles {
  private particles: Particle[] = []
  private scene: THREE.Scene
  private sharedGeometry: THREE.BoxGeometry
  private materials: Map<BlockType, THREE.MeshBasicMaterial> = new Map()
  private atlas: THREE.Texture

  constructor(scene: THREE.Scene, atlas: THREE.Texture) {
    this.scene = scene
    this.atlas = atlas
    // Small cube geometry for particles (0.3 block units — clearly visible).
    this.sharedGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3)
  }

  /** Get (or create) a material for a block type — uses the block's side tile
   *  as the particle texture via UV adjustment on the geometry. */
  private getMaterial(block: BlockType): THREE.MeshBasicMaterial {
    if (this.materials.has(block)) return this.materials.get(block)!
    const def = BLOCKS[block]
    // Use the side tile for the particle appearance.
    const tile = def.tiles[1]
    const [u0, v0, u1, v1] = tileUV(tile)
    // Clone the geometry so we can set per-block UVs.
    const geo = this.sharedGeometry.clone()
    // BoxGeometry has 6 groups (one per face), each with 4 vertices (24 total).
    // Set all faces to use the same tile UV.
    const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < 24; i += 4) {
      uvAttr.setXY(i + 0, u0, v0)
      uvAttr.setXY(i + 1, u1, v0)
      uvAttr.setXY(i + 2, u0, v1)
      uvAttr.setXY(i + 3, u1, v1)
    }
    uvAttr.needsUpdate = true
    // Recompute bounds so frustum culling works correctly.
    geo.computeBoundingSphere()
    geo.computeBoundingBox()
    // Use MeshBasicMaterial so particles are always fully lit (not affected by
    // scene lighting, which can make small particles invisible in shadowed areas
    // or at night). The atlas texture provides the color.
    void def
    const mat = new THREE.MeshBasicMaterial({
      map: this.atlas,
      alphaTest: 0.5,
      transparent: false,
    })
    // Stash the geometry on the material so we can dispose it later.
    ;(mat as unknown as { _geo: THREE.BufferGeometry })._geo = geo
    this.materials.set(block, mat)
    return mat
  }

  /** Spawn a burst of particles at the given block position. */
  spawn(blockType: BlockType, x: number, y: number, z: number, count = 12): void {
    if (blockType === 'air' || blockType === 'water') return
    const mat = this.getMaterial(blockType)
    const geo = (mat as unknown as { _geo: THREE.BufferGeometry })._geo as THREE.BufferGeometry

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat)
      // Spawn within the block's volume.
      mesh.position.set(
        x + 0.25 + Math.random() * 0.5,
        y + 0.25 + Math.random() * 0.5,
        z + 0.25 + Math.random() * 0.5,
      )
      // Random initial rotation.
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      )
      // Disable frustum culling — particle bounding spheres can be wrong
      // after geometry clone + UV rewrite, causing Three.js to skip rendering.
      mesh.frustumCulled = false
      // Outward + upward velocity.
      const angle = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 2.5
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed * 0.5,
        2.5 + Math.random() * 2.5,
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
    // Clamp dt to prevent particles from dying instantly when the tab
    // regains focus or a long frame occurs.
    dt = Math.min(dt, 0.1)
    const gravity = -14
    const dead: Particle[] = []
    for (const p of this.particles) {
      p.life -= dt
      if (p.life <= 0) {
        dead.push(p)
        continue
      }
      // Physics.
      p.velocity.y += gravity * dt
      p.mesh.position.x += p.velocity.x * dt
      p.mesh.position.y += p.velocity.y * dt
      p.mesh.position.z += p.velocity.z * dt
      // Rotation.
      p.mesh.rotation.x += p.angularVelocity.x * dt
      p.mesh.rotation.y += p.angularVelocity.y * dt
      p.mesh.rotation.z += p.angularVelocity.z * dt
      // Shrink as life ends (last 30% of life).
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

  /** Clear all particles (used on world reset). */
  clear(): void {
    for (const p of this.particles) {
      this.scene.remove(p.mesh)
    }
    this.particles = []
  }

  get count(): number {
    return this.particles.length
  }

  dispose(): void {
    this.clear()
    this.sharedGeometry.dispose()
    for (const [, mat] of this.materials) {
      const geo = (mat as unknown as { _geo?: THREE.BufferGeometry })._geo
      if (geo) geo.dispose()
      mat.dispose()
    }
    this.materials.clear()
  }
}
