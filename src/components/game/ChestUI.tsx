'use client'

import { useState, useCallback } from 'react'
import { Inventory, Slot, MAIN_SIZE, HOTBAR_SIZE } from '@/lib/game/inventory'
import { ITEMS, ItemType } from '@/lib/game/items'
import { tileDataUrl } from '@/lib/game/textures'

interface Props {
  chestPos: { x: number; y: number; z: number }
  chestSlots: Slot[]
  playerInventory: Inventory
  onClose: () => void
  onChange: () => void
}

export function ChestUI({ chestPos, chestSlots, playerInventory, onClose, onChange }: Props) {
  const [, forceUpdate] = useState(0)
  const [dragging, setDragging] = useState<Slot>(null)
  const refresh = useCallback(() => { forceUpdate(n => n + 1); onChange() }, [onChange])

  // Handle clicking a chest slot (0..26)
  const handleChestClick = (index: number) => {
    const slot = chestSlots[index]
    if (!dragging) {
      if (slot) {
        chestSlots[index] = null
        setDragging(slot)
      }
    } else {
      if (!slot) {
        chestSlots[index] = dragging
        setDragging(null)
      } else if (slot.item === dragging.item) {
        const add = Math.min(64 - slot.count, dragging.count)
        slot.count += add
        const remain = dragging.count - add
        if (remain <= 0) setDragging(null)
        else setDragging({ ...dragging, count: remain })
      } else {
        chestSlots[index] = dragging
        setDragging(slot)
      }
    }
    refresh()
  }

  // Handle clicking player inventory slot (0..38)
  const handlePlayerClick = (index: number) => {
    const slot = playerInventory.slots[index]
    if (!dragging) {
      if (slot) {
        playerInventory.setSlot(index, null)
        setDragging(slot)
      }
    } else {
      if (!slot) {
        playerInventory.setSlot(index, dragging)
        setDragging(null)
      } else if (slot.item === dragging.item) {
        const add = Math.min(64 - slot.count, dragging.count)
        playerInventory.setSlot(index, { ...slot, count: slot.count + add })
        const remain = dragging.count - add
        if (remain <= 0) setDragging(null)
        else setDragging({ ...dragging, count: remain })
      } else {
        playerInventory.setSlot(index, dragging)
        setDragging(slot)
      }
    }
    refresh()
  }

  const renderSlotButton = (slot: Slot, onClick: () => void, isHotbar = false) => (
    <button
      onClick={onClick}
      className={`relative w-11 h-11 rounded-sm border-2 ${isHotbar ? 'border-emerald-600/80 bg-zinc-800' : 'border-zinc-600 bg-zinc-800/80'} hover:border-zinc-400 flex items-center justify-center transition-colors`}
    >
      {slot && (
        <>
          <img
            src={tileDataUrl(ITEMS[slot.item]?.iconTile ?? 0)}
            alt={ITEMS[slot.item]?.name ?? slot.item}
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
      <div className="bg-zinc-900/95 rounded-xl ring-1 ring-white/15 shadow-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-bold text-white font-mono flex items-center gap-2">
            <span>📦 Treasure Chest</span>
            <span className="text-xs text-white/40 font-mono">({chestPos.x}, {chestPos.y}, {chestPos.z})</span>
          </h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">×</button>
        </div>

        {/* Chest 27-slot grid (3 rows of 9) */}
        <div className="mb-5 p-3 bg-black/40 rounded-lg border border-white/10">
          <div className="text-amber-400/80 text-xs font-mono mb-2">Chest Contents</div>
          <div className="grid grid-cols-9 gap-1.5 justify-items-center">
            {chestSlots.map((slot, i) => (
              <div key={`chest-${i}`}>
                {renderSlotButton(slot, () => handleChestClick(i))}
              </div>
            ))}
          </div>
        </div>

        {/* Player Inventory (Main 27 slots + Hotbar 12 slots) */}
        <div className="p-3 bg-black/30 rounded-lg border border-white/10">
          <div className="text-white/60 text-xs font-mono mb-2">Your Inventory</div>
          {/* Main inventory 3 rows of 9 */}
          <div className="grid grid-cols-9 gap-1.5 justify-items-center mb-3">
            {playerInventory.slots.slice(0, MAIN_SIZE).map((slot, i) => (
              <div key={`inv-main-${i}`}>
                {renderSlotButton(slot, () => handlePlayerClick(i))}
              </div>
            ))}
          </div>

          <div className="text-emerald-400/70 text-xs font-mono mb-1.5">Hotbar</div>
          {/* Hotbar row of 12 */}
          <div className="grid grid-cols-12 gap-1 justify-items-center">
            {playerInventory.slots.slice(MAIN_SIZE, MAIN_SIZE + HOTBAR_SIZE).map((slot, i) => (
              <div key={`inv-hot-${i}`}>
                {renderSlotButton(slot, () => handlePlayerClick(MAIN_SIZE + i), true)}
              </div>
            ))}
          </div>
        </div>

        {/* Dragging floating indicator */}
        {dragging && (
          <div className="mt-3 flex items-center justify-between text-xs font-mono text-white/70 bg-white/5 p-2 rounded">
            <span>Holding: <strong className="text-white">{ITEMS[dragging.item]?.name ?? dragging.item}</strong> (×{dragging.count})</span>
            <span className="text-white/40">Click any slot to place or swap</span>
          </div>
        )}
      </div>
    </div>
  )
}
