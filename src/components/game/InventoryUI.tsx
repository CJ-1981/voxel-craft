'use client'

import { useState, useCallback } from 'react'
import { Inventory, Slot, MAIN_SIZE, HOTBAR_SIZE } from '@/lib/game/inventory'
import { ITEMS, ItemType, ALL_BLOCK_ITEMS } from '@/lib/game/items'
import { tileDataUrl } from '@/lib/game/textures'

interface Props {
  inventory: Inventory
  onClose: () => void
  onChange: () => void
}

export function InventoryUI({ inventory, onClose, onChange }: Props) {
  const [, forceUpdate] = useState(0)
  const [dragging, setDragging] = useState<Slot>(null)
  const refresh = useCallback(() => { forceUpdate(n => n + 1); onChange() }, [onChange])

  const handleClick = (index: number) => {
    const slot = inventory.slots[index]
    if (!dragging) {
      // Pick up.
      if (slot) {
        inventory.setSlot(index, null)
        setDragging(slot)
      }
    } else {
      // Drop.
      if (!slot) {
        inventory.setSlot(index, dragging)
        setDragging(null)
      } else if (slot.item === dragging.item) {
        // Merge.
        const add = Math.min(64 - slot.count, dragging.count)
        const newSlot = { ...slot, count: slot.count + add }
        const newDragging = { ...dragging, count: dragging.count - add }
        inventory.setSlot(index, newSlot)
        if (newDragging.count <= 0) setDragging(null)
        else setDragging(newDragging)
      } else {
        // Swap.
        inventory.setSlot(index, dragging)
        setDragging(slot)
      }
    }
    refresh()
  }

  const renderSlot = (slot: Slot, index: number) => (
    <button
      key={index}
      onClick={() => handleClick(index)}
      className="relative w-11 h-11 rounded-sm border-2 border-zinc-600 bg-zinc-800/80 hover:border-zinc-400 flex items-center justify-center"
    >
      {slot && (
        <>
          <img
            src={tileDataUrl(ITEMS[slot.item].iconTile)}
            alt={ITEMS[slot.item].name}
            className="w-3/4 h-3/4 object-cover pixelated"
            style={{ imageRendering: 'pixelated' }}
            draggable={false}
          />
          {slot.count > 1 && (
            <span className="absolute bottom-0 right-0.5 text-[10px] font-mono text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
              {slot.count}
            </span>
          )}
        </>
      )}
    </button>
  )

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-40" onClick={onClose}>
      <div className="bg-zinc-900/95 rounded-xl ring-1 ring-white/15 shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white font-mono">Inventory</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">×</button>
        </div>

        {/* Creative item picker — click to get a stack */}
        <div className="mb-4">
          <div className="text-white/60 text-xs font-mono mb-2">Blocks — click to add a stack</div>
          <div className="grid grid-cols-9 gap-1 max-h-32 overflow-y-auto p-1 bg-black/30 rounded">
            {ALL_BLOCK_ITEMS.map((itemId) => {
              const def = ITEMS[itemId]
              return (
                <button
                  key={itemId}
                  onClick={() => { inventory.addItem(itemId, 64); refresh() }}
                  className="relative w-10 h-10 rounded-sm border border-zinc-600 bg-zinc-800/80 hover:border-emerald-400 transition-colors flex items-center justify-center"
                  title={def.name}
                >
                  <img
                    src={tileDataUrl(def.iconTile)}
                    alt={def.name}
                    className="w-3/4 h-3/4 object-cover pixelated"
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                  />
                </button>
              )
            })}
          </div>
        </div>

        {/* Main inventory */}
        <div className="grid grid-cols-9 gap-1 mb-2">
          {Array.from({ length: MAIN_SIZE }).map((_, i) => renderSlot(inventory.slots[i], i))}
        </div>
        <div className="grid grid-cols-9 gap-1 mb-4 border-t border-zinc-700 pt-2">
          {Array.from({ length: HOTBAR_SIZE }).map((_, i) => renderSlot(inventory.slots[MAIN_SIZE + i], MAIN_SIZE + i))}
        </div>

        {dragging && (
          <div className="fixed pointer-events-none top-4 left-4 w-12 h-12 rounded-sm border-2 border-white bg-zinc-800 flex items-center justify-center">
            <img src={tileDataUrl(ITEMS[dragging.item].iconTile)} alt="" className="w-3/4 h-3/4 pixelated" style={{ imageRendering: 'pixelated' }} />
            {dragging.count > 1 && <span className="absolute bottom-0 right-0.5 text-[10px] font-mono text-white">{dragging.count}</span>}
          </div>
        )}

        <p className="text-white/40 text-xs font-mono text-center">
          Click to pick up / swap · Click a block above to get 64 · E or Esc to close
        </p>
      </div>
    </div>
  )
}
