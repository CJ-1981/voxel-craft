// Tokyo landmark structures: builds iconic Tokyo architecture into the voxel world.
// Includes Tokyo Skytree / Tokyo Tower, Senso-ji Pagoda & Torii Gate, Shibuya Crossing Skyscrapers,
// Sakura Cherry Blossom Groves, and an elevated Shinkansen bullet train viaduct.

import * as THREE from 'three'
import { World, WORLD_SIZE_X, WORLD_SIZE_Z } from '../world'
import { BlockType } from '../blocks'

/** Find the surface Y at (x, z) */
function surfaceY(world: World, x: number, z: number): number {
  return world.highestBlockY(x, z)
}

function fillBox(world: World,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  block: BlockType): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        world.setBlock(x, y, z, block)
      }
    }
  }
}

function wallsBox(world: World,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  block: BlockType): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const isWall = x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1
        if (isWall) world.setBlock(x, y, z, block)
      }
    }
  }
}

// ----- 1. Tokyo Skytree / Tokyo Tower Spire -----
function buildTokyoTower(world: World, cx: number, cz: number): void {
  const baseY = surfaceY(world, cx, cz)

  // Raise stone base
  fillBox(world, cx - 6, baseY, cz - 6, cx + 6, baseY + 2, cz + 6, 'stone')

  // 4 Arching Legs (Red & White Lattice)
  const legs = [
    { dx: -4, dz: -4 },
    { dx: 4, dz: -4 },
    { dx: -4, dz: 4 },
    { dx: 4, dz: 4 },
  ]

  for (const leg of legs) {
    for (let dy = 0; dy <= 8; dy++) {
      const stepX = Math.round(leg.dx * (1 - dy / 10))
      const stepZ = Math.round(leg.dz * (1 - dy / 10))
      const b: BlockType = dy % 2 === 0 ? 'red_wool' : 'snow'
      world.setBlock(cx + stepX, baseY + 2 + dy, cz + stepZ, b)
    }
  }

  // Lower Observation Deck (Y + 10 to Y + 13)
  const deck1Y = baseY + 10
  fillBox(world, cx - 4, deck1Y, cz - 4, cx + 4, deck1Y, cz + 4, 'red_wool')
  wallsBox(world, cx - 4, deck1Y + 1, cz - 4, cx + 4, deck1Y + 3, cz + 4, 'glass')
  fillBox(world, cx - 4, deck1Y + 4, cz - 4, cx + 4, deck1Y + 4, cz + 4, 'red_wool')

  // Main Shaft (Y + 15 to Y + 28)
  for (let y = deck1Y + 5; y <= baseY + 28; y++) {
    const b: BlockType = y % 3 === 0 ? 'snow' : 'red_wool'
    world.setBlock(cx, y, cz, b)
    world.setBlock(cx + 1, y, cz, b)
    world.setBlock(cx - 1, y, cz, b)
    world.setBlock(cx, y, cz + 1, b)
    world.setBlock(cx, y, cz - 1, b)
  }

  // Upper Observation Deck (Y + 29 to Y + 32)
  const deck2Y = baseY + 29
  if (deck2Y < 44) {
    fillBox(world, cx - 3, deck2Y, cz - 3, cx + 3, deck2Y, cz + 3, 'red_wool')
    wallsBox(world, cx - 3, deck2Y + 1, cz - 3, cx + 3, deck2Y + 2, cz + 3, 'glass')
    fillBox(world, cx - 3, deck2Y + 3, cz - 3, cx + 3, deck2Y + 3, cz + 3, 'red_wool')
  }

  // Antenna Spire with Glowing Beacon
  for (let y = Math.min(deck2Y + 4, 42); y <= Math.min(deck2Y + 12, 47); y++) {
    world.setBlock(cx, y, cz, 'iron_ore')
  }
  world.setBlock(cx, Math.min(deck2Y + 13, 47), cz, 'lantern')
}

// ----- 2. Senso-ji Traditional Pagoda & Grand Torii Gate -----
function buildSensojiPagoda(world: World, cx: number, cz: number): void {
  const baseY = surfaceY(world, cx, cz)

  // 1. Grand Torii Gate (South entrance)
  const toriiZ = cz + 16
  const toriiBaseY = surfaceY(world, cx, toriiZ)
  // Left and right pillars
  for (let dy = 0; dy <= 6; dy++) {
    world.setBlock(cx - 3, toriiBaseY + dy, toriiZ, 'red_wool')
    world.setBlock(cx + 3, toriiBaseY + dy, toriiZ, 'red_wool')
  }
  // Bottom Crossbeam
  fillBox(world, cx - 4, toriiBaseY + 5, toriiZ, cx + 4, toriiBaseY + 5, toriiZ, 'red_wool')
  // Top Curved Crossbeam
  fillBox(world, cx - 5, toriiBaseY + 7, toriiZ, cx + 5, toriiBaseY + 7, toriiZ, 'red_wool')
  world.setBlock(cx - 5, toriiBaseY + 8, toriiZ, 'stairs')
  world.setBlock(cx + 5, toriiBaseY + 8, toriiZ, 'stairs')
  // Hanging lanterns under beam
  world.setBlock(cx - 2, toriiBaseY + 4, toriiZ, 'lantern')
  world.setBlock(cx + 2, toriiBaseY + 4, toriiZ, 'lantern')

  // Stone path from Torii Gate to Pagoda
  for (let z = cz; z <= toriiZ; z++) {
    const py = surfaceY(world, cx, z)
    world.setBlock(cx - 1, py, z, 'cobblestone')
    world.setBlock(cx, py, z, 'stone')
    world.setBlock(cx + 1, py, z, 'cobblestone')
  }

  // 2. 5-Tier Pagoda
  fillBox(world, cx - 5, baseY, cz - 5, cx + 5, baseY, cz + 5, 'stone')

  const tiers = [
    { r: 4, h: 4, roofR: 5 },
    { r: 3, h: 3, roofR: 4 },
    { r: 3, h: 3, roofR: 4 },
    { r: 2, h: 3, roofR: 3 },
    { r: 2, h: 3, roofR: 3 },
  ]

  let curY = baseY + 1
  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t]
    if (curY + tier.h >= 46) break

    // Wooden chamber walls
    wallsBox(world, cx - tier.r, curY, cz - tier.r, cx + tier.r, curY + tier.h - 1, cz + tier.r, 'cherry_wood')
    // Windows/lattice
    world.setBlock(cx, curY + 1, cz + tier.r, 'fence')
    world.setBlock(cx, curY + 1, cz - tier.r, 'fence')
    world.setBlock(cx + tier.r, curY + 1, cz, 'fence')
    world.setBlock(cx - tier.r, curY + 1, cz, 'fence')

    // Overhanging eave roof (dark wood/stairs)
    const roofY = curY + tier.h
    fillBox(world, cx - tier.roofR, roofY, cz - tier.roofR, cx + tier.roofR, roofY, cz + tier.roofR, 'wood')
    // Corner lanterns on eaves
    world.setBlock(cx - tier.roofR, roofY - 1, cz - tier.roofR, 'lantern')
    world.setBlock(cx + tier.roofR, roofY - 1, cz - tier.roofR, 'lantern')
    world.setBlock(cx - tier.roofR, roofY - 1, cz + tier.roofR, 'lantern')
    world.setBlock(cx + tier.roofR, roofY - 1, cz + tier.roofR, 'lantern')

    curY = roofY + 1
  }

  // Gold Finial Spire on top
  for (let dy = 0; dy <= 3; dy++) {
    if (curY + dy < 48) world.setBlock(cx, curY + dy, cz, 'gold')
  }
}

// ----- 3. Shibuya Scramble Crossing & Neon Skyscraper -----
function buildShibuyaDistrict(world: World, cx: number, cz: number): void {
  const baseY = surfaceY(world, cx, cz)

  // Asphalt road & scramble zebra crossings
  for (let dx = -10; dx <= 10; dx++) {
    for (let dz = -10; dz <= 10; dz++) {
      const isRoadX = Math.abs(dx) <= 3
      const isRoadZ = Math.abs(dz) <= 3
      if (isRoadX || isRoadZ) {
        const ry = surfaceY(world, cx + dx, cz + dz)
        const isZebra = ((dx + dz) % 2 === 0) && (Math.abs(dx) <= 3 && Math.abs(dz) <= 3)
        world.setBlock(cx + dx, ry, cz + dz, isZebra ? 'snow' : 'stone')
      }
    }
  }

  // Neon Glass Skyscraper (North-West corner)
  const bX = cx - 7, bZ = cz - 7
  const bBaseY = surfaceY(world, bX, bZ)
  const bH = 26

  for (let dy = 0; dy <= bH; dy++) {
    const y = bBaseY + dy
    if (y >= 47) break
    const isFloor = dy % 4 === 0
    if (isFloor) {
      fillBox(world, bX - 4, y, bZ - 4, bX + 4, y, bZ + 4, 'stone')
      // Neon glow strip
      world.setBlock(bX + 4, y, bZ, 'glowstone')
      world.setBlock(bX, y, bZ + 4, 'glowstone')
    } else {
      wallsBox(world, bX - 4, y, bZ - 4, bX + 4, y, bZ + 4, 'glass')
      // Corner pillars
      world.setBlock(bX - 4, y, bZ - 4, 'iron_ore')
      world.setBlock(bX + 4, y, bZ - 4, 'iron_ore')
      world.setBlock(bX - 4, y, bZ + 4, 'iron_ore')
      world.setBlock(bX + 4, y, bZ + 4, 'iron_ore')
    }
  }

  // Rooftop helipad on skyscraper
  const topY = Math.min(bBaseY + bH + 1, 47)
  fillBox(world, bX - 3, topY, bZ - 3, bX + 3, topY, bZ + 3, 'stone')
  world.setBlock(bX, topY, bZ, 'red_wool') // 'H' center
}

// ----- 4. Sakura Cherry Blossom Groves & Zen Garden -----
function plantSakuraTree(world: World, x: number, y: number, z: number): void {
  const trunkH = 4 + Math.floor(Math.random() * 2)
  for (let dy = 0; dy < trunkH; dy++) {
    world.setBlock(x, y + dy, z, 'cherry_wood')
  }

  const topY = y + trunkH
  for (let dy = -1; dy <= 1; dy++) {
    const ly = topY + dy
    const radius = dy === 1 ? 2 : 3
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0 && dy < 1) continue
        if (Math.abs(dx) === radius && Math.abs(dz) === radius && Math.random() < 0.5) continue
        const lx = x + dx
        const lz = z + dz
        if (world.getBlock(lx, ly, lz) === 'air') {
          world.setBlock(lx, ly, lz, 'cherry_leaves')
        }
      }
    }
  }
  world.setBlock(x, topY + 2, z, 'cherry_leaves')
}

function buildSakuraGarden(world: World, cx: number, cz: number): void {
  const baseY = surfaceY(world, cx, cz)

  // Zen pond with water
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist <= 3.5) {
        world.setBlock(cx + dx, baseY, cz + dz, 'water')
        world.setBlock(cx + dx, baseY - 1, cz + dz, 'sand')
      }
    }
  }

  // Wooden arched bridge over pond
  for (let dx = -3; dx <= 3; dx++) {
    const archY = baseY + (Math.abs(dx) <= 1 ? 2 : 1)
    world.setBlock(cx + dx, archY, cz, 'slab')
    world.setBlock(cx + dx, archY + 1, cz + 1, 'fence')
    world.setBlock(cx + dx, archY + 1, cz - 1, 'fence')
  }

  // Plant 6 Sakura Cherry Blossom trees around garden
  const treeOffsets = [
    { dx: -6, dz: -6 },
    { dx: 6, dz: -5 },
    { dx: -5, dz: 6 },
    { dx: 6, dz: 6 },
    { dx: 0, dz: -7 },
    { dx: 0, dz: 7 },
  ]

  for (const t of treeOffsets) {
    const tx = cx + t.dx
    const tz = cz + t.dz
    const ty = surfaceY(world, tx, tz)
    plantSakuraTree(world, tx, ty + 1, tz)
  }
}

// ----- 5. Elevated Shinkansen Bullet Train Line -----
function buildShinkansenLine(world: World, startX: number, startZ: number, len: number): void {
  const trackY = 22

  for (let i = 0; i < len; i++) {
    const x = startX + i
    const z = startZ

    // Support pillars every 8 blocks down to ground
    if (i % 8 === 0) {
      const groundY = surfaceY(world, x, z)
      for (let y = groundY; y < trackY; y++) {
        world.setBlock(x, y, z, 'stone')
      }
    }

    // Concrete track bed
    world.setBlock(x, trackY, z - 1, 'slab')
    world.setBlock(x, trackY, z, 'iron_ore') // Rails
    world.setBlock(x, trackY, z + 1, 'slab')

    // Train Carriage in the middle (30 blocks long)
    if (i >= 15 && i <= 40) {
      world.setBlock(x, trackY + 1, z, 'snow')     // White train body
      world.setBlock(x, trackY + 2, z, 'glass')    // Train windows
      world.setBlock(x, trackY + 3, z, 'red_wool') // Japanese red speed line
    }
  }
}

/**
 * Builds the complete Tokyo Megacity map.
 */
export function buildTokyoCity(world: World, scene: THREE.Scene): void {
  const cx = Math.floor(WORLD_SIZE_X / 2)
  const cz = Math.floor(WORLD_SIZE_Z / 2)

  // 1. Tokyo Tower / Skytree on elevated ground North
  buildTokyoTower(world, cx, cz - 55)

  // 2. Senso-ji Traditional Pagoda & Grand Torii Gate South-East
  buildSensojiPagoda(world, cx + 45, cz + 35)

  // 3. Shibuya Scramble Crossing & Neon Skyscraper Center-West
  buildShibuyaDistrict(world, cx - 40, cz)

  // 4. Sakura Cherry Blossom Zen Gardens South-West
  buildSakuraGarden(world, cx - 45, cz + 45)

  // 5. Elevated Shinkansen Bullet Train Track running East-West
  buildShinkansenLine(world, cx - 60, cz - 20, 120)
}
