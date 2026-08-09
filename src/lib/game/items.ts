// Items: maps block types to inventory items. Each block drops an item when mined.
import { BlockType, BLOCKS } from './blocks'

export type ItemType = `block:${BlockType}`

export interface ItemDef {
  id: ItemType
  name: string
  blockType: BlockType
  iconTile: number
}

/** Build item definitions from existing block definitions. */
export const ITEMS: Record<ItemType, ItemDef> = Object.fromEntries(
  Object.entries(BLOCKS)
    .filter(([type]) => type !== 'air' && type !== 'water')
    .map(([type, def]) => [
      `block:${type}`,
      {
        id: `block:${type}` as ItemType,
        name: def.name,
        blockType: type as BlockType,
        iconTile: def.tiles[0],
      },
    ])
) as Record<ItemType, ItemDef>

/** All placeable block items (for the hotbar / creative picker). */
export const ALL_BLOCK_ITEMS: ItemType[] = Object.values(ITEMS)
  .filter((i) => {
    const b = BLOCKS[i.blockType]
    return b.solid || b.transparent // everything except air/water
  })
  .map((i) => i.id)

/** What item a block drops when mined (simplified: drops itself). */
export function blockDropItem(block: BlockType): ItemType | null {
  if (block === 'air' || block === 'water' || block === 'bedrock') return null
  if (block === 'stone') return 'block:cobblestone'
  if (block === 'grass') return 'block:dirt'
  if (block === 'leaves') return Math.random() < 0.1 ? ('block:wood' as ItemType) : null
  if (block === 'snow' || block === 'ice') return null
  const key = `block:${block}` as ItemType
  return ITEMS[key] ? key : null
}
