// Block type definitions for the Minecraft-style game.

export type BlockType =
  | 'air'
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'wood'
  | 'leaves'
  | 'sand'
  | 'water'
  | 'planks'
  | 'cobblestone'
  | 'bedrock'
  | 'glass'
  | 'brick'
  | 'gold'
  | 'diamond'

export interface BlockDef {
  type: BlockType
  name: string
  /** Whether light passes through (used for face culling). */
  transparent?: boolean
  /** Whether the player collides with this block. */
  solid?: boolean
  /** Liquid blocks (water) — non-solid and semi-transparent. */
  liquid?: boolean
  /** Texture atlas tile indices: [top, side, bottom]. */
  tiles: [number, number, number]
}

export const BLOCKS: Record<BlockType, BlockDef> = {
  air: { type: 'air', name: 'Air', transparent: true, solid: false, tiles: [0, 0, 0] },
  grass: { type: 'grass', name: 'Grass', solid: true, tiles: [0, 1, 2] },
  dirt: { type: 'dirt', name: 'Dirt', solid: true, tiles: [2, 2, 2] },
  stone: { type: 'stone', name: 'Stone', solid: true, tiles: [3, 3, 3] },
  wood: { type: 'wood', name: 'Wood Log', solid: true, tiles: [4, 5, 4] },
  leaves: { type: 'leaves', name: 'Leaves', transparent: true, solid: true, tiles: [6, 6, 6] },
  sand: { type: 'sand', name: 'Sand', solid: true, tiles: [7, 7, 7] },
  water: { type: 'water', name: 'Water', transparent: true, solid: false, liquid: true, tiles: [8, 8, 8] },
  planks: { type: 'planks', name: 'Planks', solid: true, tiles: [9, 9, 9] },
  cobblestone: { type: 'cobblestone', name: 'Cobblestone', solid: true, tiles: [10, 10, 10] },
  bedrock: { type: 'bedrock', name: 'Bedrock', solid: true, tiles: [11, 11, 11] },
  glass: { type: 'glass', name: 'Glass', transparent: true, solid: true, tiles: [12, 12, 12] },
  brick: { type: 'brick', name: 'Brick', solid: true, tiles: [13, 13, 13] },
  gold: { type: 'gold', name: 'Gold Ore', solid: true, tiles: [14, 14, 14] },
  diamond: { type: 'diamond', name: 'Diamond', solid: true, tiles: [15, 15, 15] },
}

/** Blocks that appear in the player hotbar (in order). */
export const HOTBAR_BLOCKS: BlockType[] = [
  'grass',
  'dirt',
  'stone',
  'cobblestone',
  'wood',
  'planks',
  'leaves',
  'sand',
  'glass',
  'brick',
  'gold',
  'diamond',
]

/** Returns true if `b` is transparent (or air) — used for face culling. */
export function isTransparent(b: BlockType): boolean {
  return b === 'air' || !!BLOCKS[b].transparent
}

/** Returns true if the block stops the player. */
export function isSolid(b: BlockType): boolean {
  return !!BLOCKS[b].solid
}
