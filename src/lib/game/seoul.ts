// Seoul landmark structures: builds iconic Seoul architecture into the voxel world.
// Each landmark is placed at a fixed offset from world center, forming a small city.

import * as THREE from 'three'
import { World, WORLD_SIZE_X, WORLD_SIZE_Z, WATER_LEVEL } from './world'
import { BlockType } from './blocks'

/** Find the surface Y at (x, z) — the highest non-air, non-water block. */
function surfaceY(world: World, x: number, z: number): number {
  return world.highestBlockY(x, z)
}

/** Fill a rectangular prism with a block type. */
function fillBox(world: World, scene: THREE.Scene,
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

/** Hollow box: walls only (no interior). */
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

/** Place a single block. */
function setB(world: World, x: number, y: number, z: number, block: BlockType): void {
  world.setBlock(x, y, z, block)
}

// ----- N Seoul Tower -----
// A tall thin tower on a hill with an observation deck near the top.
function buildNSeoulTower(world: World, scene: THREE.Scene, cx: number, cz: number): void {
  const baseY = surfaceY(world, cx, cz)
  // Hill base (raise terrain under the tower).
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 4) continue
      const hillH = Math.max(0, 4 - Math.floor(dist))
      for (let dy = 0; dy < hillH; dy++) {
        const b = world.getBlock(cx + dx, baseY + dy, cz + dz)
        if (b === 'air' || b === 'water') {
          world.setBlock(cx + dx, baseY + dy, cz + dz, 'stone')
        }
      }
    }
  }
  const topY = baseY + 4 // tower starts on the hilltop

  // Tower shaft (4×4 core, 20 blocks tall) — concrete/stone.
  fillBox(world, scene, cx - 1, topY, cz - 1, cx + 1, topY + 19, cz + 1, 'stone')
  // Lighter color top section.
  fillBox(world, scene, cx - 1, topY + 15, cz - 1, cx + 1, topY + 19, cz + 1, 'planks')

  // Observation deck — wider bulb shape near the top.
  // Layer 1 (wider): 5×5
  fillBox(world, scene, cx - 2, topY + 12, cz - 2, cx + 2, topY + 14, cz + 2, 'glass')
  // Layer 2 (narrower): 3×3
  fillBox(world, scene, cx - 1, topY + 15, cz - 1, cx + 1, topY + 17, cz + 1, 'glass')

  // Antenna mast (thin, 8 blocks tall).
  for (let dy = 0; dy < 8; dy++) {
    setB(world, cx, topY + 20 + dy, cz, 'cobblestone')
  }
  // Red light on top.
  setB(world, cx, topY + 28, cz, 'glowstone')
}

// ----- Lotte World Tower -----
// Tapered glass skyscraper — tallest building in Korea (555m, but we scale to ~40 blocks).
function buildLotteWorldTower(world: World, scene: THREE.Scene, cx: number, cz: number): void {
  const baseY = surfaceY(world, cx, cz) + 1
  // Tapered design: 6 tiers, each slightly narrower, each ~6 blocks tall.
  const tiers = [
    { half: 5, height: 6 },
    { half: 4, height: 6 },
    { half: 4, height: 6 },
    { half: 3, height: 6 },
    { half: 3, height: 6 },
    { half: 2, height: 6 },
    { half: 1, height: 4 },
  ]
  let y = baseY
  for (const tier of tiers) {
    const h = tier.half
    // Glass exterior, planks interior (for floor).
    for (let dy = 0; dy < tier.height; dy++) {
      for (let dx = -h; dx <= h; dx++) {
        for (let dz = -h; dz <= h; dz++) {
          const isEdge = Math.abs(dx) === h || Math.abs(dz) === h
          if (isEdge) {
            setB(world, cx + dx, y + dy, cz + dz, 'glass')
          } else if (dy === 0) {
            setB(world, cx + dx, y + dy, cz + dz, 'planks')
          }
        }
      }
    }
    y += tier.height
  }
  // Antenna spire.
  for (let dy = 0; dy < 6; dy++) {
    setB(world, cx, y + dy, cz, 'cobblestone')
  }
  setB(world, cx, y + 6, cz, 'glowstone')
}

// ----- 63 Building -----
// Golden glass skyscraper by the Han River — rectangular with a distinctive golden top.
function build63Building(world: World, scene: THREE.Scene, cx: number, cz: number): void {
  const baseY = surfaceY(world, cx, cz) + 1
  const w = 5  // half-width (10×14 footprint)
  const d = 7
  const h = 28
  // Main body: glass with golden (gold ore) accent stripes every 4 floors.
  for (let y = 0; y < h; y++) {
    const isGoldStripe = y % 5 === 4
    for (let dx = -w; dx <= w; dx++) {
      for (let dz = -d; dz <= d; dz++) {
        const isEdge = Math.abs(dx) === w || Math.abs(dz) === d
        if (isEdge) {
          setB(world, cx + dx, baseY + y, cz + dz, isGoldStripe ? 'gold' : 'glass')
        } else if (y % 4 === 0) {
          setB(world, cx + dx, baseY + y, cz + dz, 'planks') // floor every 4 blocks
        }
      }
    }
  }
  // Golden crown on top — stepped pyramid.
  for (let dy = 0; dy < 4; dy++) {
    const sz = 3 - dy
    fillBox(world, scene, cx - sz, baseY + h + dy, cz - sz, cx + sz, baseY + h + dy, cz + sz, 'gold')
  }
  setB(world, cx, baseY + h + 4, cz, 'glowstone')
}

// ----- Gyeongbokgung Palace Gate (Gwanghwamun) -----
// Traditional Korean gate: stone base, wooden pillars, curved multi-tier roof.
function buildPalaceGate(world: World, scene: THREE.Scene, cx: number, cz: number): void {
  const baseY = surfaceY(world, cx, cz) + 1

  // Stone base platform (2 blocks high, 9×5).
  fillBox(world, scene, cx - 4, baseY, cz - 2, cx + 4, baseY + 1, cz + 2, 'cobblestone')

  // Wooden pillars (6 pillars, 5 blocks tall).
  const pillarPositions: [number, number][] = [
    [-4, -1], [-4, 1], [-2, -1], [-2, 1], [2, -1], [2, 1], [4, -1], [4, 1],
  ]
  for (const [px, pz] of pillarPositions) {
    for (let dy = 0; dy < 5; dy++) {
      setB(world, cx + px, baseY + 2 + dy, cz + pz, 'wood')
    }
  }

  // First roof tier — wide overhanging roof with red brick "tiles".
  const roofY1 = baseY + 7
  for (let dx = -6; dx <= 6; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      setB(world, cx + dx, roofY1, cz + dz, 'brick')
    }
  }
  // Roof slope (2-step pyramid).
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      setB(world, cx + dx, roofY1 + 1, cz + dz, 'brick')
    }
  }

  // Second story walls (wood).
  wallsBox(world, cx - 3, baseY + 8, cz - 1, cx + 3, baseY + 11, cz + 1, 'planks')

  // Second roof tier — smaller, with upturned corners (simplified).
  const roofY2 = baseY + 12
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      setB(world, cx + dx, roofY2, cz + dz, 'brick')
    }
  }
  // Upturned corner eaves (accent blocks at corners).
  setB(world, cx - 5, roofY2 + 1, cz - 2, 'brick')
  setB(world, cx + 5, roofY2 + 1, cz - 2, 'brick')
  setB(world, cx - 5, roofY2 + 1, cz + 2, 'brick')
  setB(world, cx + 5, roofY2 + 1, cz + 2, 'brick')

  // Ridge ornament.
  setB(world, cx, roofY2 + 2, cz, 'gold')
}

// ----- Hanok (traditional Korean house) -----
// Small house with wooden walls, paper windows, and a curved tile roof.
function buildHanok(world: World, scene: THREE.Scene, cx: number, cz: number, rotation = 0): void {
  const baseY = surfaceY(world, cx, cz) + 1
  const w = 3, d = 4, h = 3

  // Compute rotated coordinates (rotation 0 = X-facing, 1 = Z-facing).
  const sx = rotation === 0 ? w : d
  const sz = rotation === 0 ? d : w

  // Stone foundation.
  fillBox(world, scene, cx - sx, baseY - 1, cz - sz, cx + sx, baseY - 1, cz + sz, 'cobblestone')

  // Wooden walls (hollow).
  wallsBox(world, cx - sx, baseY, cz - sz, cx + sx, baseY + h, cz + sz, 'wood')

  // Door (gap in front wall).
  setB(world, cx, baseY, cz - sz, 'air')
  setB(world, cx, baseY + 1, cz - sz, 'air')

  // Windows (glass blocks on side walls).
  setB(world, cx - sx, baseY + 1, cz, 'glass')
  setB(world, cx + sx, baseY + 1, cz, 'glass')

  // Curved tile roof — brick, with overhang.
  fillBox(world, scene, cx - sx - 1, baseY + h + 1, cz - sz - 1, cx + sx + 1, baseY + h + 1, cz + sz + 1, 'brick')
  // Roof peak (ridge).
  if (rotation === 0) {
    fillBox(world, scene, cx - sx, baseY + h + 2, cz, cx + sx, baseY + h + 2, cz, 'brick')
  } else {
    fillBox(world, scene, cx, baseY + h + 2, cz - sz, cx, baseY + h + 2, cz + sz, 'brick')
  }
}

// ----- Cheonggyecheon Stream -----
// A narrow water channel running through the city with stone banks.
function buildStream(world: World, scene: THREE.Scene, cx: number, z0: number, z1: number): void {
  for (let z = z0; z <= z1; z++) {
    // Find surface height along the line.
    let y = surfaceY(world, cx, z)
    if (y < WATER_LEVEL) y = WATER_LEVEL
    // Carve a 3-block-wide, 2-block-deep channel.
    for (let dx = -1; dx <= 1; dx++) {
      setB(world, cx + dx, y, z, 'air')
      setB(world, cx + dx, y - 1, z, 'air')
    }
    // Stone banks on both sides.
    setB(world, cx - 2, y, z, 'cobblestone')
    setB(world, cx + 2, y, z, 'cobblestone')
    // Water in the channel.
    setB(world, cx, y - 1, z, 'water')
    setB(world, cx - 1, y - 1, z, 'water')
    setB(world, cx + 1, y - 1, z, 'water')
    setB(world, cx, y, z, 'water')
  }
}

// ----- City roads -----
// Simple flat roads connecting landmarks (cobblestone paths).
function buildRoad(world: World, scene: THREE.Scene,
  x0: number, z0: number, x1: number, z1: number): void {
  const dx = Math.sign(x1 - x0)
  const dz = Math.sign(z1 - z0)
  let x = x0, z = z0
  while (x !== x1 || z !== z1) {
    const y = surfaceY(world, x, z)
    setB(world, x, y + 1, z, 'cobblestone') // road surface on top of terrain
    if (x !== x1) x += dx
    else if (z !== z1) z += dz
  }
  const y = surfaceY(world, x1, z1)
  setB(world, x1, y + 1, z1, 'cobblestone')
}

/** Build all Seoul landmarks around the world center. */
export function buildSeoulCity(world: World, scene: THREE.Scene): void {
  const cx = Math.floor(WORLD_SIZE_X / 2)
  const cz = Math.floor(WORLD_SIZE_Z / 2)

  // Place landmarks at fixed offsets forming a city layout.
  // N Seoul Tower — on a hill to the north.
  buildNSeoulTower(world, scene, cx, cz - 60)

  // Lotte World Tower — tall glass tower to the east.
  buildLotteWorldTower(world, scene, cx + 40, cz - 10)

  // 63 Building — golden tower to the west.
  build63Building(world, scene, cx - 40, cz - 10)

  // Gyeongbokgung Palace Gate — to the south.
  buildPalaceGate(world, scene, cx, cz + 30)

  // Hanok village — cluster of traditional houses near the palace.
  buildHanok(world, scene, cx - 10, cz + 35, 0)
  buildHanok(world, scene, cx + 10, cz + 35, 0)
  buildHanok(world, scene, cx - 10, cz + 45, 1)
  buildHanok(world, scene, cx + 10, cz + 45, 1)
  buildHanok(world, scene, cx, cz + 55, 0)

  // Cheonggyecheon Stream — runs north-south through the city center.
  buildStream(world, scene, cx + 5, cz - 50, cz + 25)

  // Roads connecting landmarks.
  buildRoad(world, scene, cx, cz - 55, cx, cz + 25)       // N-S main road
  buildRoad(world, scene, cx - 35, cz - 10, cx + 35, cz - 10) // E-W road

  // Mark chunks around the built structures as dirty so they get re-meshed.
  // We need to rebuild any chunk that contains a modified block.
  // The simplest approach: mark all chunks within the city radius as dirty.
  const chunkSize = 16
  const cityRadius = 70 // covers all landmarks
  for (let dx = -cityRadius; dx <= cityRadius; dx += chunkSize) {
    for (let dz = -cityRadius; dz <= cityRadius; dz += chunkSize) {
      const chunkX = Math.floor((cx + dx) / chunkSize)
      const chunkZ = Math.floor((cz + dz) / chunkSize)
      world.markChunkDirty(chunkX, chunkZ)
    }
  }
}
