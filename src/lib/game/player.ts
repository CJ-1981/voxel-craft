// Player controller: physics, collision (AABB vs voxels), survival stats,
// and water/swim/fly handling.

import * as THREE from 'three'
import { World } from './world'
import { isSolid } from './blocks'

export interface InputState {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  jump: boolean
  sprint: boolean
  crouch: boolean
}

export type GameMode = 'survival' | 'creative'

export interface PlayerStats {
  health: number // 0..20 (10 hearts)
  maxHealth: number
  hunger: number // 0..20 (10 drumsticks)
  maxHunger: number
  oxygen: number // 0..10 (10 bubbles); drains when head is underwater
  maxOxygen: number
  /** Damage cooldown (invulnerability frames after taking a hit). */
  invulnTimer: number
  /** Time since last health-damaging event. */
  regenTimer: number
  /** Cumulative fall distance (for fall damage calculation). */
  fallDistance: number
  /** True if the player's head is currently submerged in water. */
  headInWater: boolean
  /** True if the player's feet are in water (swimming). */
  feetInWater: boolean
}

export class Player {
  position = new THREE.Vector3()
  velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  onGround = false
  inWater = false
  flying = false
  gameMode: GameMode = 'survival'
  stats: PlayerStats

  static readonly HALF_WIDTH = 0.3
  static readonly HEIGHT = 1.8
  static readonly EYE_HEIGHT = 1.62
  static readonly GRAVITY = -28
  static readonly WATER_GRAVITY = -6
  static readonly FLY_GRAVITY = -2 // gentle drift when flying
  static readonly JUMP_VEL = 9.2
  static readonly SWIM_UP_VEL = 4
  static readonly FLY_VEL = 9
  static readonly WALK_SPEED = 4.6
  static readonly SPRINT_SPEED = 7.4
  static readonly CROUCH_SPEED = 2.0
  static readonly WATER_SPEED = 3.0
  static readonly FLY_SPEED = 11

  constructor(x: number, y: number, z: number) {
    this.position.set(x, y, z)
    this.stats = {
      health: 20, maxHealth: 20,
      hunger: 20, maxHunger: 20,
      oxygen: 10, maxOxygen: 10,
      invulnTimer: 0, regenTimer: 0,
      fallDistance: 0,
      headInWater: false, feetInWater: false,
    }
  }

  getEyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + Player.EYE_HEIGHT, this.position.z)
  }

  getForwardVector(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize()
  }

  getRightVector(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize()
  }

  getLookDirection(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch)
    return out
      .set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp)
      .normalize()
  }

  /** Apply damage to the player (respects invulnerability). Returns true if damage applied. */
  takeDamage(amount: number, source: string): boolean {
    if (this.gameMode === 'creative') return false
    if (this.stats.invulnTimer > 0) return false
    this.stats.health = Math.max(0, this.stats.health - amount)
    this.stats.invulnTimer = 0.5
    return true
  }

  /** Heals the player (used by regen). */
  heal(amount: number): void {
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount)
  }

  /** Reduces hunger (used by sprinting/jumping). */
  exhaust(amount: number): void {
    if (this.gameMode === 'creative') return
    this.stats.hunger = Math.max(0, this.stats.hunger - amount)
  }

  /** Respawns the player at full health/hunger at the given position. */
  respawn(x: number, y: number, z: number): void {
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this.stats.health = this.stats.maxHealth
    this.stats.hunger = this.stats.maxHunger
    this.stats.oxygen = this.stats.maxOxygen
    this.stats.invulnTimer = 1.0
    this.stats.regenTimer = 0
    this.stats.fallDistance = 0
  }

  update(world: World, input: InputState, dt: number): void {
    dt = Math.min(dt, 0.05)

    // Tick invulnerability.
    if (this.stats.invulnTimer > 0) this.stats.invulnTimer -= dt
    if (this.stats.regenTimer > 0) this.stats.regenTimer -= dt

    // Detect water and lava at eye and feet level.
    const eyePos = new THREE.Vector3()
    this.getEyePosition(eyePos)
    const feetBlock = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.1),
      Math.floor(this.position.z),
    )
    const headBlock = world.getBlock(
      Math.floor(eyePos.x),
      Math.floor(eyePos.y),
      Math.floor(eyePos.z),
    )
    this.inWater = feetBlock === 'water' || feetBlock === 'lava'
    this.stats.feetInWater = feetBlock === 'water'
    this.stats.headInWater = headBlock === 'water'

    // Lava burn damage: 4 HP per second when touching lava.
    if ((feetBlock === 'lava' || headBlock === 'lava') && this.gameMode !== 'creative') {
      if (this.stats.invulnTimer <= 0) {
        this.takeDamage(4, 'mob')
      }
    }

    // Oxygen: drains when head underwater, refills when above.
    if (this.stats.headInWater && this.gameMode !== 'creative') {
      this.stats.oxygen = Math.max(0, this.stats.oxygen - dt * 1.5)
      if (this.stats.oxygen <= 0) {
        // Drowning damage: 2 HP per second.
        if (this.stats.invulnTimer <= 0) {
          this.takeDamage(2, 'drown')
        }
      }
    } else {
      this.stats.oxygen = Math.min(this.stats.maxOxygen, this.stats.oxygen + dt * 4)
    }

    // Build wish direction from input (relative to yaw, on XZ plane).
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    this.getForwardVector(forward)
    this.getRightVector(right)

    const wishDir = new THREE.Vector3()
    if (input.forward) wishDir.add(forward)
    if (input.back) wishDir.sub(forward)
    if (input.right) wishDir.add(right)
    if (input.left) wishDir.sub(right)
    if (wishDir.lengthSq() > 0) wishDir.normalize()

    // Speed depends on mode/state.
    let speed: number
    if (this.flying) {
      speed = input.sprint ? Player.FLY_SPEED * 1.6 : Player.FLY_SPEED
    } else if (this.inWater) {
      speed = Player.WATER_SPEED
    } else if (input.crouch) {
      speed = Player.CROUCH_SPEED
    } else if (input.sprint && this.stats.hunger > 6) {
      speed = Player.SPRINT_SPEED
    } else {
      speed = Player.WALK_SPEED
    }

    this.velocity.x = wishDir.x * speed
    this.velocity.z = wishDir.z * speed

    // Vertical motion
    if (this.flying) {
      // Fly mode: jump = up, crouch = down, no gravity effect.
      let vy = 0
      if (input.jump) vy += Player.FLY_VEL
      if (input.crouch) vy -= Player.FLY_VEL
      this.velocity.y = vy
      // Apply gentle gravity only if no input (so player slowly drifts down).
      if (!input.jump && !input.crouch) {
        this.velocity.y += Player.FLY_GRAVITY * dt
        if (this.velocity.y < -8) this.velocity.y = -8
      }
    } else if (this.inWater) {
      // Water physics.
      this.velocity.y += Player.WATER_GRAVITY * dt
      if (input.jump) this.velocity.y = Player.SWIM_UP_VEL
      this.velocity.y *= 0.92
    } else {
      this.velocity.y += Player.GRAVITY * dt
      if (this.velocity.y < -55) this.velocity.y = -55
      if (input.jump && this.onGround) {
        this.velocity.y = Player.JUMP_VEL
        this.onGround = false
        // Jumping costs a tiny bit of hunger (0.05).
        this.exhaust(0.05)
      }
    }

    // Sprinting drains hunger slowly.
    if (input.sprint && wishDir.lengthSq() > 0 && this.onGround && !this.flying) {
      this.exhaust(dt * 0.15)
    }

    // Fall distance tracking for fall damage.
    if (!this.flying) {
      if (!this.onGround && this.velocity.y < 0) {
        this.stats.fallDistance += -this.velocity.y * dt
      } else if (this.onGround) {
        // Apply fall damage if we fell more than 3 blocks.
        if (this.stats.fallDistance > 3.5) {
          const dmg = Math.floor(this.stats.fallDistance - 3)
          if (dmg > 0) this.takeDamage(dmg, 'fall')
        }
        this.stats.fallDistance = 0
      }
    } else {
      // Reset fall distance in fly mode.
      this.stats.fallDistance = 0
    }

    // Hunger regen / starvation.
    if (this.gameMode !== 'creative') {
      if (this.stats.hunger >= 18 && this.stats.health < this.stats.maxHealth) {
        // Regen 1 HP every 4 seconds if well-fed.
        this.stats.regenTimer -= dt
        if (this.stats.regenTimer <= 0) {
          this.heal(1)
          this.stats.regenTimer = 4
          this.exhaust(0.5) // regen costs hunger
        }
      } else if (this.stats.hunger <= 0) {
        // Starvation: lose 1 HP every 4 seconds (down to 1 HP, can't starve to death on easy).
        this.stats.regenTimer -= dt
        if (this.stats.regenTimer <= 0 && this.stats.health > 1) {
          this.takeDamage(1, 'starve')
          this.stats.regenTimer = 4
        }
      }
    }

    // Move with per-axis collision resolution.
    this.onGround = false
    this.moveAxis(world, 'x', this.velocity.x * dt)
    this.moveAxis(world, 'z', this.velocity.z * dt)
    this.moveAxis(world, 'y', this.velocity.y * dt)
  }

  private moveAxis(world: World, axis: 'x' | 'y' | 'z', amount: number): void {
    if (amount === 0) return
    const hw = Player.HALF_WIDTH
    const h = Player.HEIGHT
    const eps = 1e-4

    // Fly mode = no collision (creative flight).
    if (this.flying) {
      this.position[axis] += amount
      return
    }

    const tentative = this.position.clone()
    tentative[axis] += amount

    const minX = tentative.x - hw
    const maxX = tentative.x + hw
    const minY = tentative.y
    const maxY = tentative.y + h
    const minZ = tentative.z - hw
    const maxZ = tentative.z + hw

    const x0 = Math.floor(minX)
    const x1 = Math.floor(maxX - eps)
    const y0 = Math.floor(minY)
    const y1 = Math.floor(maxY - eps)
    const z0 = Math.floor(minZ)
    const z1 = Math.floor(maxZ - eps)

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const b = world.getBlock(x, y, z)
          if (!isSolid(b)) continue
          if (axis === 'x') {
            if (amount > 0) this.position.x = x - hw - eps
            else this.position.x = x + 1 + hw + eps
            this.velocity.x = 0
          } else if (axis === 'y') {
            if (amount > 0) {
              this.position.y = y - h - eps
            } else {
              this.position.y = y + 1 + eps
              this.onGround = true
            }
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

  static blockOverlapsPlayer(px: number, py: number, pz: number, bx: number, by: number, bz: number): boolean {
    const hw = Player.HALF_WIDTH
    const h = Player.HEIGHT
    const pminX = px - hw, pmaxX = px + hw
    const pminY = py, pmaxY = py + h
    const pminZ = pz - hw, pmaxZ = pz + hw
    return (
      pmaxX > bx && pminX < bx + 1 &&
      pmaxY > by && pminY < by + 1 &&
      pmaxZ > bz && pminZ < bz + 1
    )
  }

  static collidesAt(world: World, px: number, py: number, pz: number): boolean {
    const hw = Player.HALF_WIDTH
    const h = Player.HEIGHT
    const eps = 1e-4
    const x0 = Math.floor(px - hw)
    const x1 = Math.floor(px + hw - eps)
    const y0 = Math.floor(py)
    const y1 = Math.floor(py + h - eps)
    const z0 = Math.floor(pz - hw)
    const z1 = Math.floor(pz + hw - eps)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (isSolid(world.getBlock(x, y, z))) return true
        }
      }
    }
    return false
  }
}
