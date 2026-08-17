// Procedural structures: Underground Dungeons, Desert Pyramids, and Lava Lakes.

import { World } from './world'
import { BlockType } from './blocks'
import { Slot } from './inventory'

export interface ChestContent {
  slots: Slot[]
}

/** Random dungeon loot generator. Pass a seeded rand for deterministic loot. */
export function generateDungeonLoot(rand: () => number = Math.random): Slot[] {
  const lootTable: { item: string; min: number; max: number; chance: number }[] = [
    { item: 'block:diamond', min: 1, max: 4, chance: 0.3 },
    { item: 'block:gold', min: 2, max: 8, chance: 0.5 },
    { item: 'block:iron_ore', min: 4, max: 12, chance: 0.8 },
    { item: 'block:coal_ore', min: 8, max: 16, chance: 0.9 },
    { item: 'block:tnt', min: 2, max: 6, chance: 0.4 },
    { item: 'block:glowstone', min: 4, max: 10, chance: 0.5 },
    { item: 'block:obsidian', min: 2, max: 5, chance: 0.35 },
    { item: 'block:planks', min: 16, max: 32, chance: 0.7 },
    { item: 'block:ladder', min: 8, max: 16, chance: 0.6 },
    { item: 'block:lantern', min: 2, max: 4, chance: 0.4 },
  ]

  const slots: Slot[] = new Array(27).fill(null)
  const itemsToAdd: { item: any; count: number }[] = []

  for (const entry of lootTable) {
    if (rand() < entry.chance) {
      const count = Math.floor(rand() * (entry.max - entry.min + 1)) + entry.min
      itemsToAdd.push({ item: entry.item, count })
    }
  }

  // Pick random slots in the 27-slot chest
  const availableSlots = Array.from({ length: 27 }, (_, i) => i).sort(() => Math.random() - 0.5)
  itemsToAdd.forEach((entry, idx) => {
    if (idx < availableSlots.length) {
      slots[availableSlots[idx]] = entry
    }
  })

  return slots
}

/**
 * Builds an underground dungeon (5x5 room with cobblestone/mossy walls, spawner, and loot chest).
 * `rand` must be a seeded generator so the dungeon regenerates identically
 * from any chunk that overlaps it.
 */
export function buildDungeon(world: World, cx: number, cy: number, cz: number, rand: () => number): void {
  const rx = 3, rz = 3, h = 4

  for (let dx = -rx; dx <= rx; dx++) {
    for (let dz = -rz; dz <= rz; dz++) {
      const x = cx + dx
      const z = cz + dz

      // Floor & Ceiling
      const floorBlock: BlockType = rand() < 0.35 ? 'mossy_cobblestone' : 'cobblestone'
      const ceilBlock: BlockType = rand() < 0.25 ? 'mossy_cobblestone' : 'cobblestone'
      world.setBlock(x, cy, z, floorBlock)
      world.setBlock(x, cy + h, z, ceilBlock)

      // Hollow interior & Walls
      for (let dy = 1; dy < h; dy++) {
        const y = cy + dy
        const isWall = Math.abs(dx) === rx || Math.abs(dz) === rz
        if (isWall) {
          const wallBlock: BlockType = rand() < 0.3 ? 'mossy_cobblestone' : 'cobblestone'
          world.setBlock(x, y, z, wallBlock)
        } else {
          world.setBlock(x, y, z, 'air')
        }
      }
    }
  }

  // Central Monster Spawner
  world.setBlock(cx, cy + 1, cz, 'spawner')

  // 1-2 Chests along the walls (loot only seeded the first time the chest appears)
  const chestPos1 = { x: cx + rx - 1, y: cy + 1, z: cz }
  world.setBlock(chestPos1.x, chestPos1.y, chestPos1.z, 'chest')
  if (!world.getChestLoot(chestPos1.x, chestPos1.y, chestPos1.z)) {
    world.setChestLoot(chestPos1.x, chestPos1.y, chestPos1.z, generateDungeonLoot(rand))
  }

  if (rand() < 0.5) {
    const chestPos2 = { x: cx - rx + 1, y: cy + 1, z: cz }
    world.setBlock(chestPos2.x, chestPos2.y, chestPos2.z, 'chest')
    if (!world.getChestLoot(chestPos2.x, chestPos2.y, chestPos2.z)) {
      world.setChestLoot(chestPos2.x, chestPos2.y, chestPos2.z, generateDungeonLoot(rand))
    }
  }
}

/**
 * Builds a Desert Pyramid with stepped sandstone, central chamber, and hidden trap vault.
 * `baseY` is passed in (from the pure height function) so generation stays
 * deterministic regardless of which chunk builds the pyramid.
 */
export function buildDesertPyramid(world: World, cx: number, cz: number, baseY: number, rand: () => number): void {
  if (baseY < 12 || baseY > 30) return

  const size = 11 // 11x11 base
  const half = Math.floor(size / 2)

  // Clear air above pyramid footprint
  for (let dx = -half - 1; dx <= half + 1; dx++) {
    for (let dz = -half - 1; dz <= half + 1; dz++) {
      for (let dy = 1; dy <= 12; dy++) {
        world.setBlock(cx + dx, baseY + dy, cz + dz, 'air')
      }
    }
  }

  // Stepped pyramid exterior
  for (let level = 0; level < 6; level++) {
    const r = half - level
    const y = baseY + level
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const isOuter = Math.abs(dx) === r || Math.abs(dz) === r
        if (level === 0 || isOuter) {
          world.setBlock(cx + dx, y, cz + dz, 'sandstone')
        } else if (level <= 3) {
          // Hollow central chamber
          world.setBlock(cx + dx, y, cz + dz, 'air')
        } else {
          world.setBlock(cx + dx, y, cz + dz, 'sandstone')
        }
      }
    }
  }

  // Entrance doorway on South face
  world.setBlock(cx, baseY + 1, cz + half, 'air')
  world.setBlock(cx, baseY + 2, cz + half, 'air')
  world.setBlock(cx, baseY + 1, cz + half - 1, 'air')
  world.setBlock(cx, baseY + 2, cz + half - 1, 'air')

  // Center altar / glyph
  world.setBlock(cx, baseY + 1, cz, 'gold')
  world.setBlock(cx + 1, baseY + 1, cz, 'sandstone')
  world.setBlock(cx - 1, baseY + 1, cz, 'sandstone')
  world.setBlock(cx, baseY + 1, cz + 1, 'sandstone')
  world.setBlock(cx, baseY + 1, cz - 1, 'sandstone')

  // Lanterns on corners
  world.setBlock(cx - half + 1, baseY + 1, cz - half + 1, 'lantern')
  world.setBlock(cx + half - 1, baseY + 1, cz - half + 1, 'lantern')
  world.setBlock(cx - half + 1, baseY + 1, cz + half - 1, 'lantern')
  world.setBlock(cx + half - 1, baseY + 1, cz + half - 1, 'lantern')

  // Secret Treasure Chamber Below Altar (y - 4)
  const vaultY = baseY - 4
  if (vaultY > 2) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        // Vault floor
        world.setBlock(cx + dx, vaultY, cz + dz, 'sandstone')
        // Vault air space
        for (let dy = 1; dy <= 3; dy++) {
          const isWall = Math.abs(dx) === 2 || Math.abs(dz) === 2
          world.setBlock(cx + dx, vaultY + dy, cz + dz, isWall ? 'sandstone' : 'air')
        }
      }
    }

    // 4 Corner Treasure Chests
    const chestPositions = [
      { x: cx - 1, y: vaultY + 1, z: cz - 1 },
      { x: cx + 1, y: vaultY + 1, z: cz - 1 },
      { x: cx - 1, y: vaultY + 1, z: cz + 1 },
      { x: cx + 1, y: vaultY + 1, z: cz + 1 },
    ]

    for (const cp of chestPositions) {
      world.setBlock(cp.x, cp.y, cp.z, 'chest')
      if (!world.getChestLoot(cp.x, cp.y, cp.z)) {
        world.setChestLoot(cp.x, cp.y, cp.z, generateDungeonLoot(rand))
      }
    }

    // Central TNT Trap
    world.setBlock(cx, vaultY, cz, 'tnt')
    world.setBlock(cx, vaultY + 1, cz, 'sandstone')
  }
}

/**
 * Builds a natural Lava Lake in a basin.
 */
export function buildLavaLake(world: World, cx: number, cy: number, cz: number, radius = 3, rand: () => number = Math.random): void {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist <= radius) {
        const x = cx + dx
        const z = cz + dz
        // Bed of obsidian/stone underneath
        world.setBlock(x, cy - 1, z, rand() < 0.4 ? 'obsidian' : 'stone')
        // Lava liquid
        world.setBlock(x, cy, z, 'lava')
        // Air above
        world.setBlock(x, cy + 1, z, 'air')
        world.setBlock(x, cy + 2, z, 'air')
      } else if (dist <= radius + 1) {
        // Stone rim
        const x = cx + dx
        const z = cz + dz
        world.setBlock(x, cy, z, rand() < 0.3 ? 'obsidian' : 'stone')
      }
    }
  }
}
