// Procedural pixel-art texture atlas for all block types.
// Generates a single canvas with tiles in a 4-column grid, each tile is 16x16 pixels.
// This gives the authentic Minecraft pixelated look without external assets.

import * as THREE from 'three'

export const TILE_SIZE = 16 // pixels per tile
export const ATLAS_COLS = 4
export const ATLAS_ROWS = 8 // grew from 4 to 8 to fit new blocks
export const ATLAS_TILES = 32

type RGB = [number, number, number]

function fill(ctx: CanvasRenderingContext2D, x: number, y: number, color: RGB) {
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`
  ctx.fillRect(x, y, 1, 1)
}

function noisy(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  base: RGB, variants: RGB[], density = 0.35,
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
  noisy(ctx, ox, oy, [122, 90, 56], [[110, 80, 48], [134, 100, 64], [104, 72, 44]], 0.35)
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
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const dx = x - 7.5, dy = y - 7.5
      const d = Math.sqrt(dx * dx + dy * dy)
      const ring = Math.floor(d) % 2 === 0
      fill(ctx, ox + x, oy + y, ring ? [156, 120, 70] : [134, 100, 56])
    }
  }
}
function drawWoodSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
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
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
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
  for (let y = 0; y < TILE_SIZE; y++) {
    const row = Math.floor(y / 4)
    const base: RGB = row % 2 === 0 ? [168, 128, 76] : [156, 118, 68]
    for (let x = 0; x < TILE_SIZE; x++) {
      const n = Math.random() < 0.15
      fill(ctx, ox + x, oy + y, n ? [142, 106, 60] : base)
    }
  }
  for (let y = 0; y < TILE_SIZE; y += 4) {
    for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [110, 80, 44])
  }
}
function drawCobblestone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [110, 110, 110], [[88, 88, 88], [128, 128, 128], [98, 98, 98]], 0.5)
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
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      ctx.fillStyle = 'rgba(200,220,230,0.22)'
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }
  }
  ctx.fillStyle = 'rgb(180,210,225)'
  for (let i = 0; i < TILE_SIZE; i++) {
    fill(ctx, ox + i, oy + 0, [180, 210, 225])
    fill(ctx, ox + i, oy + 15, [180, 210, 225])
    fill(ctx, ox + 0, oy + i, [180, 210, 225])
    fill(ctx, ox + 15, oy + i, [180, 210, 225])
  }
  for (let i = 2; i < 6; i++) fill(ctx, ox + i, oy + i, [240, 250, 255])
}
function drawBrick(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [156, 74, 58])
  ctx.fillStyle = 'rgb(200,190,180)'
  for (let y = 0; y < TILE_SIZE; y += 4) for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [200, 190, 180])
  for (let y = 0; y < TILE_SIZE; y += 8) for (let x = 0; x < TILE_SIZE; x += 8) for (let dy = 0; dy < 4; dy++) fill(ctx, ox + x, oy + y + dy, [200, 190, 180])
  for (let y = 4; y < TILE_SIZE; y += 8) for (let x = 4; x < TILE_SIZE; x += 8) for (let dy = 0; dy < 4; dy++) fill(ctx, ox + x, oy + y + dy, [200, 190, 180])
}
function drawGold(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [128, 128, 128], [[112, 112, 112], [142, 142, 142]], 0.4)
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [240, 200, 60])
  }
}
function drawDiamond(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [128, 128, 128], [[112, 112, 112], [142, 142, 142]], 0.4)
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [120, 230, 230])
  }
}

// ----- New tile drawers (16-29) -----

function drawSnow(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [240, 245, 250], [[230, 236, 244], [248, 252, 255], [222, 228, 238]], 0.4)
}
function drawIce(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const ripple = Math.sin((x + y) * 0.5) * 0.5
      const alpha = 0.55 + ripple * 0.15
      ctx.fillStyle = `rgba(150,200,240,${Math.max(0.4, Math.min(0.85, alpha))})`
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }
  }
  // Cracks
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [200, 230, 250])
  }
}
function drawCactus(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Green body with darker border
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const edge = x < 2 || x > 13
      const base: RGB = edge ? [60, 110, 50] : [80, 140, 65]
      fill(ctx, ox + x, oy + y, base)
    }
  }
  // Spines
  for (let i = 0; i < 6; i++) {
    const x = 4 + Math.floor(Math.random() * 8)
    const y = 2 + Math.floor(Math.random() * 12)
    fill(ctx, ox + x, oy + y, [220, 220, 180])
  }
}
function drawFlowerRed(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Transparent background, X-shaped plant
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  // Green stem
  for (let y = 8; y < 16; y++) fill(ctx, ox + 7, oy + y, [60, 130, 50])
  for (let y = 8; y < 16; y++) fill(ctx, ox + 8, oy + y, [60, 130, 50])
  // Red petals (top)
  for (let y = 2; y < 8; y++) {
    for (let x = 4; x < 12; x++) {
      const dx = x - 7.5, dy = y - 5
      if (Math.sqrt(dx * dx + dy * dy) < 4) fill(ctx, ox + x, oy + y, [220, 50, 50])
    }
  }
  // Yellow center
  fill(ctx, ox + 7, oy + 5, [240, 220, 60])
  fill(ctx, ox + 8, oy + 5, [240, 220, 60])
  fill(ctx, ox + 7, oy + 6, [240, 220, 60])
  fill(ctx, ox + 8, oy + 6, [240, 220, 60])
}
function drawFlowerYellow(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  for (let y = 8; y < 16; y++) fill(ctx, ox + 7, oy + y, [60, 130, 50])
  for (let y = 8; y < 16; y++) fill(ctx, ox + 8, oy + y, [60, 130, 50])
  for (let y = 2; y < 8; y++) {
    for (let x = 4; x < 12; x++) {
      const dx = x - 7.5, dy = y - 5
      if (Math.sqrt(dx * dx + dy * dy) < 4) fill(ctx, ox + x, oy + y, [240, 220, 60])
    }
  }
  fill(ctx, ox + 7, oy + 5, [220, 140, 40])
  fill(ctx, ox + 8, oy + 5, [220, 140, 40])
  fill(ctx, ox + 7, oy + 6, [220, 140, 40])
  fill(ctx, ox + 8, oy + 6, [220, 140, 40])
}
function drawCoalOre(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [128, 128, 128], [[112, 112, 112], [142, 142, 142]], 0.4)
  // Coal flecks (dark)
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [30, 30, 30])
  }
}
function drawIronOre(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [128, 128, 128], [[112, 112, 112], [142, 142, 142]], 0.4)
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [200, 160, 120])
  }
}
function drawStairs(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Stairs texture (looks like steps from the side)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const stepIdx = Math.floor((15 - y) / 4) // 0..3
      const base: RGB = [180 - stepIdx * 12, 140 - stepIdx * 8, 80 - stepIdx * 4]
      fill(ctx, ox + x, oy + y, base)
    }
  }
  // Step highlights (top edge of each step)
  for (let s = 0; s < 4; s++) {
    const yTop = 15 - s * 4
    for (let x = 0; x < TILE_SIZE; x++) {
      fill(ctx, ox + x, oy + yTop, [200, 160, 90])
    }
  }
}
function drawSlab(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let y = 0; y < TILE_SIZE; y++) {
    const base: RGB = y < 8 ? [168, 128, 76] : [120, 88, 50]
    for (let x = 0; x < TILE_SIZE; x++) {
      const n = Math.random() < 0.15
      fill(ctx, ox + x, oy + y, n ? [142, 106, 60] : base)
    }
  }
}
function drawFence(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Mostly transparent with vertical posts + horizontal rails
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  // Posts on left and right edges
  for (let y = 0; y < TILE_SIZE; y++) {
    fill(ctx, ox + 1, oy + y, [120, 88, 52])
    fill(ctx, ox + 2, oy + y, [120, 88, 52])
    fill(ctx, ox + 13, oy + y, [120, 88, 52])
    fill(ctx, ox + 14, oy + y, [120, 88, 52])
  }
  // Horizontal rails (top and bottom)
  for (let x = 0; x < TILE_SIZE; x++) {
    fill(ctx, ox + x, oy + 3, [140, 100, 60])
    fill(ctx, ox + x, oy + 4, [140, 100, 60])
    fill(ctx, ox + x, oy + 11, [140, 100, 60])
    fill(ctx, ox + x, oy + 12, [140, 100, 60])
  }
}
function drawDoor(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Wooden door, mostly transparent border
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 2; x < 14; x++) {
      fill(ctx, ox + x, oy + y, [140, 95, 55])
    }
  }
  // Frame
  for (let i = 0; i < TILE_SIZE; i++) {
    fill(ctx, ox + 2, oy + i, [80, 55, 30])
    fill(ctx, ox + 13, oy + i, [80, 55, 30])
  }
  // Handle
  fill(ctx, ox + 11, oy + 8, [240, 200, 60])
  fill(ctx, ox + 11, oy + 9, [240, 200, 60])
}
function drawLadder(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  // Two vertical rails
  for (let y = 0; y < TILE_SIZE; y++) {
    fill(ctx, ox + 3, oy + y, [140, 100, 60])
    fill(ctx, ox + 12, oy + y, [140, 100, 60])
  }
  // Horizontal rungs every 4 pixels
  for (let y = 2; y < TILE_SIZE; y += 4) {
    for (let x = 3; x <= 12; x++) fill(ctx, ox + x, oy + y, [160, 120, 75])
    for (let x = 3; x <= 12; x++) fill(ctx, ox + x, oy + y + 1, [160, 120, 75])
  }
}
function drawTnt(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // Red body with "TNT" label
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const edge = y < 2 || y > 13
      fill(ctx, ox + x, oy + y, edge ? [80, 80, 80] : [200, 50, 40])
    }
  }
  // White label band
  for (let y = 6; y < 10; y++) {
    for (let x = 2; x < 14; x++) fill(ctx, ox + x, oy + y, [240, 240, 240])
  }
  // "TNT" letters
  fill(ctx, ox + 4, oy + 7, [40, 40, 40]); fill(ctx, ox + 4, oy + 8, [40, 40, 40])
  fill(ctx, ox + 5, oy + 7, [40, 40, 40]); fill(ctx, ox + 5, oy + 8, [40, 40, 40])
  fill(ctx, ox + 6, oy + 7, [40, 40, 40]); fill(ctx, ox + 6, oy + 8, [40, 40, 40])
  fill(ctx, ox + 7, oy + 7, [40, 40, 40]); fill(ctx, ox + 7, oy + 8, [40, 40, 40])
  fill(ctx, ox + 8, oy + 7, [40, 40, 40]); fill(ctx, ox + 8, oy + 8, [40, 40, 40])
  fill(ctx, ox + 9, oy + 7, [40, 40, 40]); fill(ctx, ox + 9, oy + 8, [40, 40, 40])
  fill(ctx, ox + 10, oy + 7, [40, 40, 40]); fill(ctx, ox + 10, oy + 8, [40, 40, 40])
  fill(ctx, ox + 11, oy + 7, [40, 40, 40]); fill(ctx, ox + 11, oy + 8, [40, 40, 40])
}
function drawGlowstone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [200, 170, 90], [[230, 200, 110], [180, 150, 70], [240, 220, 130]], 0.6)
  // Bright spots
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(Math.random() * TILE_SIZE)
    const y = Math.floor(Math.random() * TILE_SIZE)
    fill(ctx, ox + x, oy + y, [255, 240, 180])
  }
}

const TILE_DRAWERS: ((ctx: CanvasRenderingContext2D, ox: number, oy: number) => void)[] = [
  drawGrassTop, drawGrassSide, drawDirt, drawStone,        // 0-3
  drawWoodTop, drawWoodSide, drawLeaves, drawSand,          // 4-7
  drawWater, drawPlanks, drawCobblestone, drawBedrock,      // 8-11
  drawGlass, drawBrick, drawGold, drawDiamond,              // 12-15
  drawSnow, drawIce, drawCactus, drawFlowerRed,             // 16-19
  drawFlowerYellow, drawCoalOre, drawIronOre, drawStairs,   // 20-23
  drawSlab, drawFence, drawDoor, drawLadder,                // 24-27
  drawTnt, drawGlowstone,                                   // 28-29
  // Padding for unused tiles 30, 31 (draw as solid magenta to make errors visible)
  (ctx, ox, oy) => { for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [255, 0, 255]) },
  (ctx, ox, oy) => { for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [255, 0, 255]) },
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

export function buildAtlasTexture(): THREE.CanvasTexture {
  const canvas = buildAtlasCanvas()
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  // Use NearestFilter (no mipmaps) for the atlas. The atlas has NO padding between
  // adjacent tiles, so enabling mipmaps (NearestMipmapNearestFilter) causes lower mip
  // levels to average pixels across tile boundaries — producing visible color bleeding
  // (e.g. green grass-top pixels from tile 1 smear onto the adjacent dirt tile 2, then
  // appear on vertical dirt faces in-world). NearestFilter is also the classic pixel-art
  // look for this style of game.
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 1
  tex.premultiplyAlpha = true
  return tex
}

export function tileUV(tile: number): [number, number, number, number] {
  const col = tile % ATLAS_COLS
  const row = Math.floor(tile / ATLAS_COLS)
  const u0 = col / ATLAS_COLS
  const u1 = (col + 1) / ATLAS_COLS
  const v0 = 1 - (row + 1) / ATLAS_ROWS
  const v1 = 1 - row / ATLAS_ROWS
  return [u0, v0, u1, v1]
}

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
