// Procedural pixel-art texture atlas for all block types.
// Generates a single canvas with 16 tiles in a 4x4 grid, each tile is 16x16 pixels.
// This gives the authentic Minecraft pixelated look without external assets.

import * as THREE from 'three'

export const TILE_SIZE = 16 // pixels per tile
export const ATLAS_COLS = 4
export const ATLAS_ROWS = 4
export const ATLAS_TILES = 16

type RGB = [number, number, number]

function fill(ctx: CanvasRenderingContext2D, x: number, y: number, color: RGB) {
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`
  ctx.fillRect(x, y, 1, 1)
}

function noisy(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  base: RGB,
  variants: RGB[],
  density = 0.35,
) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (Math.random() < density) {
        const v = variants[Math.floor(Math.random() * variants.length)]
        fill(ctx, ox + x, oy + y, v)
      } else {
        fill(ctx, ox + x, oy + y, base)
      }
    }
  }
}

function drawGrassTop(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [86, 140, 58], [[76, 130, 48], [96, 150, 68], [70, 120, 42]], 0.4)
}

function drawGrassSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Dirt base
  noisy(ctx, ox, oy, [122, 90, 56], [[110, 80, 48], [134, 100, 64], [104, 72, 44]], 0.35)
  // Green top strip
  for (let x = 0; x < TILE_SIZE; x++) {
    const h = 3 + Math.floor(Math.random() * 2)
    for (let y = 0; y < h; y++) {
      const g = 120 + Math.floor(Math.random() * 30)
      fill(ctx, ox + x, oy + y, [70 + Math.floor(Math.random() * 20), g, 50 + Math.floor(Math.random() * 20)])
    }
  }
}

function drawDirt(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [122, 90, 56], [[110, 80, 48], [134, 100, 64], [104, 72, 44]], 0.35)
}

function drawStone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [128, 128, 128], [[112, 112, 112], [142, 142, 142], [120, 120, 120]], 0.4)
}

function drawWoodTop(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Concentric rings
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const dx = x - 7.5
      const dy = y - 7.5
      const d = Math.sqrt(dx * dx + dy * dy)
      const ring = Math.floor(d) % 2 === 0
      fill(ctx, ox + x, oy + y, ring ? [156, 120, 70] : [134, 100, 56])
    }
  }
}

function drawWoodSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Vertical bark
  for (let x = 0; x < TILE_SIZE; x++) {
    const base: RGB = x % 4 < 2 ? [104, 74, 42] : [120, 88, 52]
    for (let y = 0; y < TILE_SIZE; y++) {
      const n = Math.random() < 0.2
      fill(ctx, ox + x, oy + y, n ? [90, 62, 34] : base)
    }
  }
}

function drawLeaves(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [60, 110, 40], [[48, 96, 32], [72, 128, 52], [40, 84, 28]], 0.6)
}

function drawSand(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [218, 200, 138], [[206, 188, 126], [230, 212, 150], [200, 182, 120]], 0.4)
}

function drawWater(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Mostly transparent with subtle ripples so the alpha-test pass keeps
  // the surface visible without making it opaque.
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      // Wave streaks
      const ripple = Math.sin((x + y) * 0.7) + Math.sin(x * 0.4) * 0.5
      const alpha = 0.55 + ripple * 0.18
      const r = 54 + Math.floor(Math.random() * 8)
      const g = 96 + Math.floor(Math.random() * 12)
      const b = 180 + Math.floor(Math.random() * 16)
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0.35, Math.min(0.9, alpha))})`
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }
  }
}

function drawPlanks(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Horizontal planks
  for (let y = 0; y < TILE_SIZE; y++) {
    const row = Math.floor(y / 4)
    const base: RGB = row % 2 === 0 ? [168, 128, 76] : [156, 118, 68]
    for (let x = 0; x < TILE_SIZE; x++) {
      const n = Math.random() < 0.15
      fill(ctx, ox + x, oy + y, n ? [142, 106, 60] : base)
    }
  }
  // Plank dividers
  for (let y = 0; y < TILE_SIZE; y += 4) {
    for (let x = 0; x < TILE_SIZE; x++) {
      fill(ctx, ox + x, oy + y, [110, 80, 44])
    }
  }
}

function drawCobblestone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [110, 110, 110], [[88, 88, 88], [128, 128, 128], [98, 98, 98]], 0.5)
  // Cracks
  ctx.fillStyle = 'rgb(70,70,70)'
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [70, 70, 70])
  }
}

function drawBedrock(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [60, 60, 60], [[40, 40, 40], [80, 80, 80], [50, 50, 50]], 0.6)
}

function drawGlass(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Mostly transparent (alpha ~0.25) with a visible border + highlight.
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      ctx.fillStyle = 'rgba(200,220,230,0.22)'
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }
  }
  // Border (opaque frame)
  ctx.fillStyle = 'rgb(180,210,225)'
  for (let i = 0; i < TILE_SIZE; i++) {
    fill(ctx, ox + i, oy + 0, [180, 210, 225])
    fill(ctx, ox + i, oy + 15, [180, 210, 225])
    fill(ctx, ox + 0, oy + i, [180, 210, 225])
    fill(ctx, ox + 15, oy + i, [180, 210, 225])
  }
  // Highlight streak (opaque)
  for (let i = 2; i < 6; i++) {
    fill(ctx, ox + i, oy + i, [240, 250, 255])
  }
}

function drawBrick(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      fill(ctx, ox + x, oy + y, [156, 74, 58])
    }
  }
  // Mortar lines
  ctx.fillStyle = 'rgb(200,190,180)'
  for (let y = 0; y < TILE_SIZE; y += 4) {
    for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [200, 190, 180])
  }
  for (let y = 0; y < TILE_SIZE; y += 8) {
    for (let x = 0; x < TILE_SIZE; x += 8) {
      for (let dy = 0; dy < 4; dy++) fill(ctx, ox + x, oy + y + dy, [200, 190, 180])
    }
  }
  for (let y = 4; y < TILE_SIZE; y += 8) {
    for (let x = 4; x < TILE_SIZE; x += 8) {
      for (let dy = 0; dy < 4; dy++) fill(ctx, ox + x, oy + y + dy, [200, 190, 180])
    }
  }
}

function drawGold(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [128, 128, 128], [[112, 112, 112], [142, 142, 142]], 0.4)
  // Gold flecks
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [240, 200, 60])
  }
}

function drawDiamond(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [128, 128, 128], [[112, 112, 112], [142, 142, 142]], 0.4)
  // Diamond flecks
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [120, 230, 230])
  }
}

const TILE_DRAWERS: ((ctx: CanvasRenderingContext2D, ox: number, oy: number) => void)[] = [
  drawGrassTop, // 0
  drawGrassSide, // 1
  drawDirt, // 2
  drawStone, // 3
  drawWoodTop, // 4
  drawWoodSide, // 5
  drawLeaves, // 6
  drawSand, // 7
  drawWater, // 8
  drawPlanks, // 9
  drawCobblestone, // 10
  drawBedrock, // 11
  drawGlass, // 12
  drawBrick, // 13
  drawGold, // 14
  drawDiamond, // 15
]

/** Builds the texture atlas canvas. Must be called in the browser. */
export function buildAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = TILE_SIZE * ATLAS_COLS
  canvas.height = TILE_SIZE * ATLAS_ROWS
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (let i = 0; i < ATLAS_TILES; i++) {
    const col = i % ATLAS_COLS
    const row = Math.floor(i / ATLAS_COLS)
    const ox = col * TILE_SIZE
    const oy = row * TILE_SIZE
    TILE_DRAWERS[i](ctx, ox, oy)
  }
  return canvas
}

/** Returns a THREE.CanvasTexture for the atlas, configured for pixel-art rendering. */
export function buildAtlasTexture(): THREE.CanvasTexture {
  const canvas = buildAtlasCanvas()
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestMipmapNearestFilter
  tex.generateMipmaps = true
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 1
  tex.premultiplyAlpha = true
  return tex
}

/** Returns the UV rectangle [u0, v0, u1, v1] for a tile index in the atlas. */
export function tileUV(tile: number): [number, number, number, number] {
  const col = tile % ATLAS_COLS
  const row = Math.floor(tile / ATLAS_COLS)
  // In Three.js, texture V is flipped (origin bottom-left). Atlas row 0 is at top of image.
  const u0 = col / ATLAS_COLS
  const u1 = (col + 1) / ATLAS_COLS
  const v0 = 1 - (row + 1) / ATLAS_ROWS
  const v1 = 1 - row / ATLAS_ROWS
  return [u0, v0, u1, v1]
}

/** Renders a single tile as an <img>-style data URL (used for the hotbar UI). */
export function tileDataUrl(tile: number): string {
  const atlas = buildAtlasCanvas()
  const c = document.createElement('canvas')
  c.width = TILE_SIZE
  c.height = TILE_SIZE
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const col = tile % ATLAS_COLS
  const row = Math.floor(tile / ATLAS_COLS)
  ctx.drawImage(atlas, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE)
  return c.toDataURL('image/png')
}
