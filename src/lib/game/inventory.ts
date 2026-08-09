// Inventory: manages item stacks in 39 slots (27 main + 12 hotbar).
import { ItemType } from './items'

export interface ItemStack {
  item: ItemType
  count: number
}

export type Slot = ItemStack | null

export const MAIN_SIZE = 27
export const HOTBAR_SIZE = 12
export const TOTAL_SIZE = MAIN_SIZE + HOTBAR_SIZE
export const MAX_STACK = 64

export class Inventory {
  slots: Slot[] = new Array(TOTAL_SIZE).fill(null)
  selected = 0

  getSelectedItem(): Slot {
    return this.slots[MAIN_SIZE + this.selected]
  }

  /** Add items — prefers the hotbar first, then main inventory. */
  addItem(item: ItemType, count: number): number {
    const order: number[] = []
    for (let i = MAIN_SIZE; i < TOTAL_SIZE; i++) order.push(i)
    for (let i = 0; i < MAIN_SIZE; i++) order.push(i)
    // Stack onto existing.
    for (const i of order) {
      if (count <= 0) break
      const s = this.slots[i]
      if (s && s.item === item && s.count < MAX_STACK) {
        const add = Math.min(MAX_STACK - s.count, count)
        s.count += add
        count -= add
      }
    }
    // Fill empty.
    for (const i of order) {
      if (count <= 0) break
      if (!this.slots[i]) {
        const add = Math.min(MAX_STACK, count)
        this.slots[i] = { item, count: add }
        count -= add
      }
    }
    return count
  }

  removeOneFromSelected(): ItemType | null {
    const idx = MAIN_SIZE + this.selected
    const s = this.slots[idx]
    if (!s) return null
    const item = s.item
    s.count--
    if (s.count <= 0) this.slots[idx] = null
    return item
  }

  setSlot(index: number, slot: Slot): void {
    this.slots[index] = slot
  }

  clear(): void {
    this.slots = new Array(TOTAL_SIZE).fill(null)
  }

  /** Give starter blocks for a new game. */
  giveStarterKit(): void {
    this.addItem('block:planks', 32)
    this.addItem('block:cobblestone', 32)
    this.addItem('block:glass', 16)
    this.addItem('block:glowstone', 8)
    this.addItem('block:tnt', 4)
    this.addItem('block:dirt', 16)
  }
}
