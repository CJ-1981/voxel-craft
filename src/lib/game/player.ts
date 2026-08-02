// Player controller: physics, collision (AABB vs voxels), and water/swim handling.

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
}

export class Player {
  position = new THREE.Vector3()
  velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  onGround = false
  inWater = false

  static readonly HALF_WIDTH = 0.3
  static readonly HEIGHT = 1.8
  static readonly EYE_HEIGHT = 1.62
  static readonly GRAVITY = -28
  static readonly WATER_GRAVITY = -6
  static readonly JUMP_VEL = 9.2
  static readonly SWIM_UP_VEL = 4
  static readonly WALK_SPEED = 4.6
  static readonly SPRINT_SPEED = 7.4
  static readonly WATER_SPEED = 3.0

  constructor(x: number, y: number, z: number) {
    this.position.set(x, y, z)
  }

  getEyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + Player.EYE_HEIGHT, this.position.z)
  }

  /** Forward vector on the XZ plane (yaw only). */
  getForwardVector(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize()
  }

  getRightVector(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize()
  }

  /** Look direction including pitch (for raycasting). */
  getLookDirection(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch)
    return out
      .set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp)
      .normalize()
  }

  update(world: World, input: InputState, dt: number): void {
    // Clamp dt to avoid huge steps when tab loses focus.
    dt = Math.min(dt, 0.05)

    // Detect water at eye and feet level.
    const eyePos = new THREE.Vector3()
    this.getEyePosition(eyePos)
    const feetBlock = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.1),
      Math.floor(this.position.z),
    )
    this.inWater = feetBlock === 'water'

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

    let speed = input.sprint ? Player.SPRINT_SPEED : Player.WALK_SPEED
    if (this.inWater) speed = Player.WATER_SPEED

    this.velocity.x = wishDir.x * speed
    this.velocity.z = wishDir.z * speed

    // Vertical motion
    if (this.inWater) {
      // Water physics: buoyancy + swim-up on jump.
      this.velocity.y += Player.WATER_GRAVITY * dt
      if (input.jump) this.velocity.y = Player.SWIM_UP_VEL
      // Damping
      this.velocity.y *= 0.92
    } else {
      this.velocity.y += Player.GRAVITY * dt
      if (this.velocity.y < -55) this.velocity.y = -55
      if (input.jump && this.onGround) {
        this.velocity.y = Player.JUMP_VEL
        this.onGround = false
      }
    }

    // Move with per-axis collision resolution.
    // Order: X, Z, Y. Y last so onGround reflects post-move state.
    const wasOnGround = this.onGround
    this.onGround = false
    this.moveAxis(world, 'x', this.velocity.x * dt)
    this.moveAxis(world, 'z', this.velocity.z * dt)
    this.moveAxis(world, 'y', this.velocity.y * dt)
    // If we didn't move horizontally because we walked into a wall, velocity is already 0.
    void wasOnGround
  }

  private moveAxis(world: World, axis: 'x' | 'y' | 'z', amount: number): void {
    if (amount === 0) return
    const hw = Player.HALF_WIDTH
    const h = Player.HEIGHT
    const eps = 1e-4

    const tentative = this.position.clone()
    tentative[axis] += amount

    // Player AABB at tentative position.
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
          // Overlap confirmed; resolve along `axis`.
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

    // No collision: accept the move.
    this.position.copy(tentative)
  }

  /** True if a 1x1x1 block at (bx, by, bz) would overlap the player AABB at `pos`. */
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

  /** True if the player AABB at `pos` collides with any solid block. */
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
