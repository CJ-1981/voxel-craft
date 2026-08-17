// Corner minimap: a top-down canvas view of the streamed world.
//
// Renders the highest visible block per column (biome-ish colors, shaded by
// height for terrain relief). Per-chunk 16×16 color rasters are cached and kept
// forever, so areas the player has explored stay visible on the map even after
// those chunks stream out. Mobs show as dots; the player is a rotating arrow.

import { World, CHUNK_SIZE, WORLD_SIZE_Y, chunkKey } from './world'
import { BlockType } from './blocks'

/** Top-down colors for the minimap. */
const BLOCK_COLORS: Partial<Record<BlockType, [number, number, number]>> = {
  grass: [106, 170, 64],
  dirt: [134, 96, 62],
  stone: [132, 132, 132],
  wood: [110, 84, 50],
  cherry_wood: [148, 92, 82],
  leaves: [58, 116, 48],
  cherry_leaves: [230, 158, 184],
  sand: [222, 206, 158],
  sandstone: [214, 194, 148],
  water: [52, 118, 200],
  ice: [168, 205, 240],
  lava: [238, 96, 24],
  snow: [236, 240, 246],
  planks: [168, 132, 84],
  cobblestone: [122, 122, 122],
  mossy_cobblestone: [98, 122, 92],
  bedrock: [58, 58, 58],
  glass: [202, 228, 238],
  brick: [152, 74, 62],
  gold: [236, 200, 82],
  diamond: [118, 228, 228],
  coal_ore: [72, 72, 72],
  iron_ore: [196, 158, 128],
  obsidian: [42, 32, 58],
  cactus: [88, 144, 72],
  flower_red: [150, 60, 60],
  flower_yellow: [200, 180, 60],
  tnt: [196, 72, 56],
  glowstone: [244, 214, 110],
  lantern: [246, 200, 96],
  spawner: [44, 52, 62],
  chest: [172, 118, 58],
  red_wool: [196, 60, 56],
  slab: [150, 150, 150],
  stairs: [142, 142, 142],
  fence: [124, 96, 62],
  door: [140, 104, 64],
  ladder: [150, 120, 76],
}

const DEFAULT_COLOR: [number, number, number] = [128, 128, 128]

/** Blocks the top-down scan descends through (map shows what is under them). */
const SKIP_BLOCKS = new Set<BlockType>(['air'])

export interface MinimapMobDot {
  x: number
  z: number
  hostile: boolean
}

export class Minimap {
  private ctx: CanvasRenderingContext2D
  private dpr: number
  /** Cached 16×16 top-color raster per chunk — kept after unload (explored map). */
  private chunkCache = new Map<number, HTMLCanvasElement>()
  /** Device pixels per block. */
  zoom = 2
  /** View radius in blocks (for HUD display). */
  viewRadius = 64

  constructor(private canvas: HTMLCanvasElement) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssSize = canvas.clientWidth || 160
    canvas.width = Math.round(cssSize * this.dpr)
    canvas.height = Math.round(cssSize * this.dpr)
    this.ctx = canvas.getContext('2d')!
    this.ctx.imageSmoothingEnabled = false
  }

  /** Cycles zoom: 2 → 1 → 4 px/block. */
  toggleZoom(): void {
    this.zoom = this.zoom === 2 ? 1 : this.zoom === 1 ? 4 : 2
  }

  /** Re-reads the CSS size (after viewport changes / orientation flips). */
  resize(): void {
    const cssSize = this.canvas.clientWidth || 160
    const w = Math.round(cssSize * this.dpr)
    if (w !== this.canvas.width) {
      this.canvas.width = w
      this.canvas.height = w
    }
  }

  update(world: World, mobs: MinimapMobDot[], px: number, pz: number, yaw: number): void {
    // Invalidate cached rasters for chunks the world reports as edited.
    for (const k of world.consumeMinimapDirty()) this.chunkCache.delete(k)

    const S = this.canvas.width
    const scale = this.zoom * this.dpr
    const view = S / scale // blocks visible across the map
    this.viewRadius = Math.round(view / 2)
    const half = view / 2

    const ctx = this.ctx
    ctx.fillStyle = '#10141f'
    ctx.fillRect(0, 0, S, S)
    ctx.imageSmoothingEnabled = false

    // Chunk-aligned blit of cached rasters.
    const cx0 = Math.floor((px - half) / CHUNK_SIZE)
    const cx1 = Math.floor((px + half) / CHUNK_SIZE)
    const cz0 = Math.floor((pz - half) / CHUNK_SIZE)
    const cz1 = Math.floor((pz + half) / CHUNK_SIZE)
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = chunkKey(cx, cz)
        let raster: HTMLCanvasElement | null = this.chunkCache.get(k) ?? null
        if (!raster) {
          raster = this.renderChunk(world, cx, cz)
          if (!raster) continue // not streamed in yet — stays dark
          this.chunkCache.set(k, raster)
        }
        const sx = (cx * CHUNK_SIZE - px + half) * scale
        const sy = (cz * CHUNK_SIZE - pz + half) * scale
        ctx.drawImage(raster, sx, sy, CHUNK_SIZE * scale, CHUNK_SIZE * scale)
      }
    }

    // Mob dots.
    for (const m of mobs) {
      const sx = (m.x - px + half) * scale
      const sy = (m.z - pz + half) * scale
      if (sx < -4 || sy < -4 || sx > S + 4 || sy > S + 4) continue
      ctx.fillStyle = m.hostile ? '#ff5252' : '#f2f2f2'
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 1
      const r = 2.2 * this.dpr
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // Player arrow (yaw = 0 faces north/-Z, i.e. up on the map).
    ctx.save()
    ctx.translate(S / 2, S / 2)
    ctx.rotate(-yaw)
    const a = 6 * this.dpr
    ctx.beginPath()
    ctx.moveTo(0, -a)
    ctx.lineTo(a * 0.7, a * 0.8)
    ctx.lineTo(0, a * 0.4)
    ctx.lineTo(-a * 0.7, a * 0.8)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.lineWidth = 1.5 * this.dpr
    ctx.stroke()
    ctx.fill()
    ctx.restore()

    // Compass "N".
    ctx.font = `bold ${10 * this.dpr}px monospace`
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText('N', S / 2, 11 * this.dpr)
    // Zoom label.
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(`${this.zoom}×`, S - 5 * this.dpr, 11 * this.dpr)
  }

  /** Builds the 16×16 top-color raster for one chunk (null when unloaded). */
  private renderChunk(world: World, cx: number, cz: number): HTMLCanvasElement | null {
    const data = world.getChunkData(cx, cz)
    if (!data) return null
    const raster = document.createElement('canvas')
    raster.width = CHUNK_SIZE
    raster.height = CHUNK_SIZE
    const rctx = raster.getContext('2d')!
    const img = rctx.createImageData(CHUNK_SIZE, CHUNK_SIZE)
    const area = CHUNK_SIZE * CHUNK_SIZE

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        // Scan the column top-down for the first visible block.
        const col = lx + lz * CHUNK_SIZE
        let color = DEFAULT_COLOR
        let topY = 0
        for (let y = WORLD_SIZE_Y - 1; y >= 0; y--) {
          const t = world.blockIdToType(data[col + y * area])
          if (t === null || SKIP_BLOCKS.has(t)) continue
          const c = BLOCK_COLORS[t]
          // Unlisted block types keep a stone-ish grey but shade with height.
          color = c ?? DEFAULT_COLOR
          topY = y
          break
        }
        // Height shading gives the map terrain relief.
        const shade = 0.72 + 0.011 * topY
        const o = (lx + lz * CHUNK_SIZE) * 4
        img.data[o] = Math.min(255, color[0] * shade)
        img.data[o + 1] = Math.min(255, color[1] * shade)
        img.data[o + 2] = Math.min(255, color[2] * shade)
        img.data[o + 3] = 255
      }
    }
    rctx.putImageData(img, 0, 0)
    return raster
  }

  dispose(): void {
    this.chunkCache.clear()
  }
}
