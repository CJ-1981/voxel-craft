// Block type definitions for the Minecraft-style game.

export type BlockType =
  | 'air' | 'grass' | 'dirt' | 'stone' | 'wood' | 'leaves' | 'sand' | 'water'
  | 'planks' | 'cobblestone' | 'bedrock' | 'glass' | 'brick' | 'gold' | 'diamond'
  // Biomes & building blocks (v1.1)
  | 'snow' | 'ice' | 'cactus' | 'flower_red' | 'flower_yellow'
  | 'coal_ore' | 'iron_ore'
  | 'stairs' | 'slab' | 'fence' | 'door' | 'ladder' | 'tnt' | 'glowstone'
  // Structures, mechanics & Tokyo map blocks (v1.2)
  | 'lava' | 'obsidian' | 'sandstone' | 'chest' | 'spawner' | 'mossy_cobblestone'
  | 'cherry_leaves' | 'cherry_wood' | 'red_wool' | 'lantern'

export interface BlockDef {
  type: BlockType
  name: string
  /** Whether light passes through (used for face culling). */
  transparent?: boolean
  /** Translucent blocks (water, glass, ice, lava) render in a separate blended pass. */
  translucent?: boolean
  /** Whether the player collides with this block. */
  solid?: boolean
  /** Liquid blocks (water, lava) — non-solid and semi-transparent. */
  liquid?: boolean
  /** Cross-shaped (X-plant) blocks like flowers — render as 2 diagonal quads. */
  cross?: boolean
  /** Slab blocks — half-height, render top face at y+0.5. */
  slab?: boolean
  /** Light emission (for glowstone, lava, lantern). 0 = no emission. */
  light?: number
  /** Whether breaking this block drops a harvestable item (for crafting). */
  harvestable?: boolean
  /** Texture atlas tile indices: [top, side, bottom]. */
  tiles: [number, number, number]
}

export const BLOCKS: Record<BlockType, BlockDef> = {
  air:        { type: 'air', name: 'Air', transparent: true, solid: false, tiles: [0, 0, 0] },
  grass:      { type: 'grass', name: 'Grass', solid: true, harvestable: true, tiles: [0, 1, 2] },
  dirt:       { type: 'dirt', name: 'Dirt', solid: true, harvestable: true, tiles: [2, 2, 2] },
  stone:      { type: 'stone', name: 'Stone', solid: true, harvestable: true, tiles: [3, 3, 3] },
  wood:       { type: 'wood', name: 'Wood Log', solid: true, harvestable: true, tiles: [4, 5, 4] },
  leaves:     { type: 'leaves', name: 'Leaves', transparent: true, solid: true, tiles: [6, 6, 6] },
  sand:       { type: 'sand', name: 'Sand', solid: true, harvestable: true, tiles: [7, 7, 7] },
  water:      { type: 'water', name: 'Water', transparent: true, translucent: true, solid: false, liquid: true, tiles: [8, 8, 8] },
  planks:     { type: 'planks', name: 'Planks', solid: true, harvestable: true, tiles: [9, 9, 9] },
  cobblestone:{ type: 'cobblestone', name: 'Cobblestone', solid: true, harvestable: true, tiles: [10, 10, 10] },
  bedrock:    { type: 'bedrock', name: 'Bedrock', solid: true, tiles: [11, 11, 11] },
  glass:      { type: 'glass', name: 'Glass', transparent: true, translucent: true, solid: true, tiles: [12, 12, 12] },
  brick:      { type: 'brick', name: 'Brick', solid: true, harvestable: true, tiles: [13, 13, 13] },
  gold:       { type: 'gold', name: 'Gold Ore', solid: true, harvestable: true, tiles: [14, 14, 14] },
  diamond:    { type: 'diamond', name: 'Diamond Ore', solid: true, harvestable: true, tiles: [15, 15, 15] },
  // Biome blocks (tile indices 16-20)
  snow:       { type: 'snow', name: 'Snow', solid: true, harvestable: true, tiles: [16, 16, 16] },
  ice:        { type: 'ice', name: 'Ice', transparent: true, translucent: true, solid: true, tiles: [17, 17, 17] },
  cactus:     { type: 'cactus', name: 'Cactus', solid: true, transparent: true, cross: false, harvestable: true, tiles: [18, 18, 18] },
  flower_red: { type: 'flower_red', name: 'Red Flower', transparent: true, solid: false, cross: true, harvestable: true, tiles: [19, 19, 19] },
  flower_yellow: { type: 'flower_yellow', name: 'Yellow Flower', transparent: true, solid: false, cross: true, harvestable: true, tiles: [20, 20, 20] },
  // Ores (tile indices 21-22)
  coal_ore:   { type: 'coal_ore', name: 'Coal Ore', solid: true, harvestable: true, tiles: [21, 21, 21] },
  iron_ore:   { type: 'iron_ore', name: 'Iron Ore', solid: true, harvestable: true, tiles: [22, 22, 22] },
  // Building blocks (tile indices 23-29)
  stairs:     { type: 'stairs', name: 'Stairs', solid: true, harvestable: true, tiles: [23, 23, 23] },
  slab:       { type: 'slab', name: 'Slab', solid: true, slab: true, harvestable: true, tiles: [24, 24, 24] },
  fence:      { type: 'fence', name: 'Fence', solid: true, transparent: true, harvestable: true, tiles: [25, 25, 25] },
  door:       { type: 'door', name: 'Door', transparent: true, solid: false, harvestable: true, tiles: [26, 26, 26] },
  ladder:     { type: 'ladder', name: 'Ladder', transparent: true, solid: false, harvestable: true, tiles: [27, 27, 27] },
  tnt:        { type: 'tnt', name: 'TNT', solid: true, harvestable: true, tiles: [28, 28, 28] },
  glowstone:  { type: 'glowstone', name: 'Glowstone', solid: true, harvestable: true, light: 15, tiles: [29, 29, 29] },
  // New in v1.2: structures & Tokyo map blocks (tile indices 30-39)
  lava:       { type: 'lava', name: 'Lava', transparent: true, translucent: true, solid: false, liquid: true, light: 15, tiles: [30, 30, 30] },
  obsidian:   { type: 'obsidian', name: 'Obsidian', solid: true, harvestable: true, tiles: [31, 31, 31] },
  sandstone:  { type: 'sandstone', name: 'Sandstone', solid: true, harvestable: true, tiles: [32, 33, 32] },
  chest:      { type: 'chest', name: 'Chest', solid: true, transparent: true, harvestable: true, tiles: [34, 35, 34] },
  spawner:    { type: 'spawner', name: 'Monster Spawner', solid: true, transparent: true, harvestable: true, light: 5, tiles: [36, 36, 36] },
  mossy_cobblestone: { type: 'mossy_cobblestone', name: 'Mossy Cobblestone', solid: true, harvestable: true, tiles: [37, 37, 37] },
  cherry_leaves: { type: 'cherry_leaves', name: 'Cherry Leaves', solid: true, transparent: true, harvestable: true, tiles: [38, 38, 38] },
  cherry_wood: { type: 'cherry_wood', name: 'Cherry Wood', solid: true, harvestable: true, tiles: [39, 40, 39] },
  red_wool:   { type: 'red_wool', name: 'Red Lacquer', solid: true, harvestable: true, tiles: [41, 41, 41] },
  lantern:    { type: 'lantern', name: 'Lantern', solid: true, transparent: true, harvestable: true, light: 15, tiles: [42, 42, 42] },
}

/** Blocks that appear in the player hotbar (in order). */
export const HOTBAR_BLOCKS: BlockType[] = [
  'grass', 'dirt', 'stone', 'cobblestone', 'wood', 'planks',
  'leaves', 'sand', 'snow', 'glass', 'brick', 'glowstone',
  'stairs', 'slab', 'fence', 'tnt', 'obsidian', 'sandstone',
  'chest', 'cherry_leaves', 'cherry_wood', 'red_wool', 'lantern', 'lava',
]

/** Returns true if `b` is transparent (or air) — used for face culling. */
export function isTransparent(b: BlockType): boolean {
  return b === 'air' || !!BLOCKS[b]?.transparent
}

/** Returns true if the block stops the player. */
export function isSolid(b: BlockType): boolean {
  return !!BLOCKS[b]?.solid
}
