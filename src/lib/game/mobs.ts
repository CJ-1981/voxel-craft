// Mob system: passive animals (sheep) and hostile zombies (spawn at night).
// Mobs have simple AABB physics, basic AI, and model meshes built from boxes.

import * as THREE from 'three'
import { World, WORLD_SIZE_X, WORLD_SIZE_Z } from './world'
import { isSolid } from './blocks'
import { Player } from './player'
import type { BreakParticles } from './particles'

export type MobType = 'sheep' | 'zombie'

interface MobModelParts {
  group: THREE.Group
  body: THREE.Mesh
  head: THREE.Mesh
  legs: THREE.Mesh[]
}

export class Mob {
  type: MobType
  position = new THREE.Vector3()
  velocity = new THREE.Vector3()
  yaw = 0
  onGround = false
  health = 10
  maxHealth = 10
  attackCooldown = 0
  /** AI timer — mob picks a new random direction every few seconds. */
  wanderTimer = 0
  /** Wander direction (radians). */
  wanderDir = 0
  /** When true, mob is "aggroed" on the player and chases. */
  aggro = false
  model: MobModelParts
  /** Half-width for AABB. */
  hw = 0.4
  /** Height. */
  height = 1.4
  /** Time alive (for animation). */
  age = 0

  constructor(type: MobType, x: number, y: number, z: number) {
    this.type = type
    this.position.set(x, y, z)
    if (type === 'sheep') {
      this.health = 8; this.maxHealth = 8
      this.hw = 0.4; this.height = 1.3
      this.model = Mob.buildSheepModel()
    } else {
      this.health = 20; this.maxHealth = 20
      this.hw = 0.3; this.height = 1.8
      this.model = Mob.buildZombieModel()
    }
    this.model.group.position.copy(this.position)
  }

  static buildSheepModel(): MobModelParts {
    const group = new THREE.Group()
    // Body: light grey box
    const bodyGeo = new THREE.BoxGeometry(0.9, 0.7, 1.3)
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xeaeaea })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = 0.7
    group.add(body)
    // Head: dark grey
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
    const headMat = new THREE.MeshLambertMaterial({ color: 0xd0d0c8 })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0, 0.85, 0.9)
    group.add(head)
    // 4 legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.5, 0.25)
    const legMat = new THREE.MeshLambertMaterial({ color: 0xd0d0c8 })
    const legs: THREE.Mesh[] = []
    for (const [dx, dz] of [[-0.3, -0.45], [0.3, -0.45], [-0.3, 0.45], [0.3, 0.45]]) {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(dx, 0.25, dz)
      group.add(leg)
      legs.push(leg)
    }
    return { group, body, head, legs }
  }

  static buildZombieModel(): MobModelParts {
    const group = new THREE.Group()
    // Body: green shirt
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.3)
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3a })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = 1.0
    group.add(body)
    // Head: green skin
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
    const headMat = new THREE.MeshLambertMaterial({ color: 0x6a9a5a })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0, 1.65, 0)
    group.add(head)
    // Arms: outstretched forward (classic zombie pose)
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2)
    const armMat = new THREE.MeshLambertMaterial({ color: 0x6a9a5a })
    const armL = new THREE.Mesh(armGeo, armMat)
    armL.position.set(-0.4, 1.0, 0.35)
    armL.rotation.x = -Math.PI / 2
    group.add(armL)
    const armR = new THREE.Mesh(armGeo, armMat)
    armR.position.set(0.4, 1.0, 0.35)
    armR.rotation.x = -Math.PI / 2
    group.add(armR)
    // Legs: blue pants
    const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.25)
    const legMat = new THREE.MeshLambertMaterial({ color: 0x3a4a7a })
    const legs: THREE.Mesh[] = []
    const legL = new THREE.Mesh(legGeo, legMat)
    legL.position.set(-0.18, 0.35, 0)
    group.add(legL); legs.push(legL)
    const legR = new THREE.Mesh(legGeo, legMat)
    legR.position.set(0.18, 0.35, 0)
    group.add(legR); legs.push(legR)
    return { group, body, head, legs }
  }

  /** Update AI + physics. Returns true if mob should be despawned (health <= 0 or fell out of world). */
  update(world: World, player: Player, dt: number): boolean {
    if (this.health <= 0) return true
    if (this.position.y < -10) return true // fell out of world

    dt = Math.min(dt, 0.05)
    this.age += dt
    if (this.attackCooldown > 0) this.attackCooldown -= dt

    // AI: distance to player.
    const dx = player.position.x - this.position.x
    const dz = player.position.z - this.position.z
    const distSq = dx * dx + dz * dz

    if (this.type === 'zombie') {
      // Zombies aggro on player within 12 blocks.
      this.aggro = distSq < 12 * 12
    }

    // Movement decision.
    let moveX = 0, moveZ = 0
    let speed = this.type === 'sheep' ? 1.5 : 2.0
    if (this.type === 'zombie' && this.aggro) {
      // Chase player.
      const dist = Math.sqrt(distSq) || 1
      moveX = dx / dist
      moveZ = dz / dist
      speed = 2.5
      // Face the player.
      this.yaw = Math.atan2(-dx, -dz)
      // Attack if close enough.
      if (distSq < 1.2 && this.attackCooldown <= 0) {
        player.takeDamage(3, 'zombie')
        this.attackCooldown = 1.0
      }
    } else {
      // Wander: pick a new direction every 3-5 seconds.
      this.wanderTimer -= dt
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 2
        // 50% chance to stand still.
        if (Math.random() < 0.5) {
          this.wanderDir = Math.random() * Math.PI * 2
        } else {
          this.wanderDir = -1 // sentinel: don't move
        }
      }
      if (this.wanderDir >= 0) {
        moveX = Math.sin(this.wanderDir)
        moveZ = Math.cos(this.wanderDir)
        this.yaw = this.wanderDir
      }
    }

    // Apply horizontal velocity.
    this.velocity.x = moveX * speed
    this.velocity.z = moveZ * speed

    // Gravity.
    this.velocity.y -= 28 * dt
    if (this.velocity.y < -55) this.velocity.y = -55

    // Auto-jump if blocked horizontally and on ground.
    if (this.onGround && (Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01)) {
      const ahead = this.worldBlockAhead(world)
      if (ahead && isSolid(ahead)) {
        this.velocity.y = 8 // jump
        this.onGround = false
      }
    }

    // Move with collision.
    this.onGround = false
    this.moveAxis(world, 'x', this.velocity.x * dt)
    this.moveAxis(world, 'z', this.velocity.z * dt)
    this.moveAxis(world, 'y', this.velocity.y * dt)

    // Update model.
    this.model.group.position.copy(this.position)
    this.model.group.rotation.y = this.yaw
    // Leg swing animation when moving.
    const moving = Math.abs(moveX) + Math.abs(moveZ) > 0.1
    if (moving && this.model.legs.length === 4) {
      const swing = Math.sin(this.age * 8) * 0.4
      this.model.legs[0].rotation.x = swing
      this.model.legs[1].rotation.x = -swing
      this.model.legs[2].rotation.x = -swing
      this.model.legs[3].rotation.x = swing
    } else if (this.model.legs.length === 2) {
      const swing = moving ? Math.sin(this.age * 8) * 0.4 : 0
      this.model.legs[0].rotation.x = swing
      this.model.legs[1].rotation.x = -swing
    }

    return false
  }

  private worldBlockAhead(world: World): string | null {
    const dx = Math.sin(this.yaw)
    const dz = Math.cos(this.yaw)
    const x = Math.floor(this.position.x + dx * (this.hw + 0.2))
    const y = Math.floor(this.position.y)
    const z = Math.floor(this.position.z + dz * (this.hw + 0.2))
    return world.getBlock(x, y, z) as string
  }

  private moveAxis(world: World, axis: 'x' | 'y' | 'z', amount: number): void {
    if (amount === 0) return
    const hw = this.hw
    const h = this.height
    const eps = 1e-4
    const tentative = this.position.clone()
    tentative[axis] += amount
    const minX = tentative.x - hw, maxX = tentative.x + hw
    const minY = tentative.y, maxY = tentative.y + h
    const minZ = tentative.z - hw, maxZ = tentative.z + hw
    const x0 = Math.floor(minX), x1 = Math.floor(maxX - eps)
    const y0 = Math.floor(minY), y1 = Math.floor(maxY - eps)
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - eps)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (!isSolid(world.getBlock(x, y, z))) continue
          if (axis === 'x') {
            if (amount > 0) this.position.x = x - hw - eps
            else this.position.x = x + 1 + hw + eps
            this.velocity.x = 0
          } else if (axis === 'y') {
            if (amount > 0) this.position.y = y - h - eps
            else { this.position.y = y + 1 + eps; this.onGround = true }
            this.velocity.y = 0
          } else {
            if (amount > 0) this.position.z = z - hw - eps
            else this.position.z = z + 1 + hw + eps
            this.velocity.z = 0
          }
          return
        }
      }
    }
    this.position.copy(tentative)
  }

  /** Take damage from player attack. Returns true if killed. */
  takeDamage(amount: number): boolean {
    this.health -= amount
    // Knockback: push mob away from player.
    this.velocity.y = 4
    return this.health <= 0
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.model.group)
    this.model.group.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        ;(obj.material as THREE.Material).dispose()
      }
    })
  }
}

export class MobManager {
  mobs: Mob[] = []
  scene: THREE.Scene
  /** Particle system reference (set by the game component) — used to spawn
   *  demolition particles when mobs are hit/killed. */
  particles: BreakParticles | null = null
  /** Cooldown before next spawn tick. */
  private spawnTimer = 0
  /** Cooldown before next despawn check. */
  private despawnTimer = 0
  maxMobs = 12

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /** Attach a particle system so mob hits/kills spawn demolition particles. */
  setParticles(p: BreakParticles): void {
    this.particles = p
  }

  /** Called every frame. Handles spawn/despawn + mob updates. */
  update(world: World, player: Player, isNight: boolean, dt: number): void {
    // Spawn passive mobs (sheep) during day, hostile (zombie) at night.
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2
      if (this.mobs.length < this.maxMobs) {
        // Pick spawn location: random offset 8-16 blocks from player.
        const angle = Math.random() * Math.PI * 2
        const dist = 8 + Math.random() * 8
        const sx = Math.floor(player.position.x + Math.cos(angle) * dist)
        const sz = Math.floor(player.position.z + Math.sin(angle) * dist)
        if (sx >= 0 && sx < WORLD_SIZE_X && sz >= 0 && sz < WORLD_SIZE_Z) {
          const surfY = world.highestBlockY(sx, sz)
          if (surfY > 0) {
            const type: MobType = isNight ? (Math.random() < 0.7 ? 'zombie' : 'sheep') : 'sheep'
            const mob = new Mob(type, sx + 0.5, surfY + 1, sz + 0.5)
            this.mobs.push(mob)
            this.scene.add(mob.model.group)
          }
        }
      }
    }

    // Despawn dead/distant mobs.
    this.despawnTimer -= dt
    if (this.despawnTimer <= 0) {
      this.despawnTimer = 5
      const toDespawn: Mob[] = []
      for (const mob of this.mobs) {
        const dx = mob.position.x - player.position.x
        const dz = mob.position.z - player.position.z
        const distSq = dx * dx + dz * dz
        if (distSq > 32 * 32) toDespawn.push(mob)
      }
      for (const m of toDespawn) {
        m.dispose(this.scene)
        const i = this.mobs.indexOf(m)
        if (i >= 0) this.mobs.splice(i, 1)
      }
    }

    // Update all mobs.
    const dead: Mob[] = []
    for (const mob of this.mobs) {
      if (mob.update(world, player, dt)) dead.push(mob)
    }
    for (const m of dead) {
      m.dispose(this.scene)
      const i = this.mobs.indexOf(m)
      if (i >= 0) this.mobs.splice(i, 1)
    }
  }

  /** Player attacked a block — check if any mob is hit by the ray and damage it.
   *  Returns true if a mob was hit. Also spawns demolition particles on hit
   *  and a larger burst on kill. */
  tryHitMob(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number): boolean {
    let closestMob: Mob | null = null
    let closestDist = maxDistance
    for (const mob of this.mobs) {
      // Ray-sphere intersection (use bounding sphere of mob AABB).
      const cx = mob.position.x - origin.x
      const cy = (mob.position.y + mob.height / 2) - origin.y
      const cz = mob.position.z - origin.z
      const radius = mob.hw + 0.3
      // Project onto ray direction.
      const t = cx * dir.x + cy * dir.y + cz * dir.z
      if (t < 0 || t > closestDist) continue
      // Perpendicular distance.
      const px = origin.x + dir.x * t
      const py = origin.y + dir.y * t
      const pz = origin.z + dir.z * t
      const dx = mob.position.x - px
      const dy = (mob.position.y + mob.height / 2) - py
      const dz = mob.position.z - pz
      const perp = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (perp <= radius) {
        closestMob = mob
        closestDist = t
      }
    }
    if (closestMob) {
      // Spawn hit particles at the mob's center mass.
      if (this.particles) {
        this.particles.spawnMob(
          closestMob.type,
          closestMob.position.x,
          closestMob.position.y + closestMob.height / 2,
          closestMob.position.z,
          10,
          false,
        )
      }
      const killed = closestMob.takeDamage(7) // 7 damage per hit (sword)
      if (killed) {
        // Spawn a larger burst of particles on death.
        if (this.particles) {
          this.particles.spawnMob(
            closestMob.type,
            closestMob.position.x,
            closestMob.position.y + closestMob.height / 2,
            closestMob.position.z,
            18,
            true,
          )
        }
        closestMob.dispose(this.scene)
        const i = this.mobs.indexOf(closestMob)
        if (i >= 0) this.mobs.splice(i, 1)
      }
      return true
    }
    return false
  }

  dispose(): void {
    for (const m of this.mobs) m.dispose(this.scene)
    this.mobs = []
  }
}
