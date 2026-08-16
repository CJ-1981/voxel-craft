// Procedural pixel-art texture atlas for all block types.
// Generates a single canvas with tiles in a 4-column grid, each tile is 16x16 pixels.
// This gives the authentic Minecraft pixelated look without external assets.

import * as THREE from 'three'

export const TILE_SIZE = 16 // pixels per tile
export const ATLAS_COLS = 4
export const ATLAS_ROWS = 12 // 48 tiles total (supports base + biomes + structures + tokyo blocks)
export const ATLAS_TILES = 48

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
}
function drawCobblestone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [100, 100, 100], [[80, 80, 80], [120, 120, 120], [60, 60, 60], [140, 140, 140]], 0.55)
}
function drawBedrock(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [40, 40, 40], [[20, 20, 20], [60, 60, 60], [10, 10, 10]], 0.5)
}
function drawGlass(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  ctx.fillStyle = 'rgba(210, 235, 255, 0.4)'
  ctx.fillRect(ox, oy, TILE_SIZE, TILE_SIZE)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.strokeRect(ox + 0.5, oy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1)
  fill(ctx, ox + 3, oy + 3, [255, 255, 255])
  fill(ctx, ox + 4, oy + 4, [255, 255, 255])
  fill(ctx, ox + 5, oy + 5, [255, 255, 255])
}
function drawBrick(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let y = 0; y < TILE_SIZE; y++) {
    const isMortarY = y % 4 === 0
    for (let x = 0; x < TILE_SIZE; x++) {
      const row = Math.floor(y / 4)
      const offset = (row % 2) * 4
      const isMortarX = (x + offset) % 8 === 0
      if (isMortarY || isMortarX) {
        fill(ctx, ox + x, oy + y, [190, 180, 170])
      } else {
        const v = Math.random() < 0.2 ? [160, 60, 48] : [144, 52, 40]
        fill(ctx, ox + x, oy + y, v as RGB)
      }
    }
  }
}
function drawOre(ctx: CanvasRenderingContext2D, ox: number, oy: number, oreColor: RGB, oreLight: RGB) {
  drawStone(ctx, ox, oy)
  const clusters = [
    [3, 4], [4, 4], [4, 5],
    [9, 10], [10, 10], [10, 11], [11, 10],
    [11, 3], [12, 3], [12, 4],
    [5, 11], [6, 12],
  ]
  for (const [cx, cy] of clusters) {
    fill(ctx, ox + cx, oy + cy, Math.random() < 0.4 ? oreLight : oreColor)
  }
}
function drawGold(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawOre(ctx, ox, oy, [230, 190, 50], [255, 225, 90])
}
function drawDiamond(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawOre(ctx, ox, oy, [75, 220, 230], [160, 245, 255])
}
function drawSnow(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [240, 244, 248], [[228, 234, 240], [250, 252, 255], [216, 224, 232]], 0.35)
}
function drawIce(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  ctx.fillStyle = 'rgba(175, 215, 245, 0.75)'
  ctx.fillRect(ox, oy, TILE_SIZE, TILE_SIZE)
  noisy(ctx, ox, oy, [175, 215, 245], [[195, 230, 255], [155, 198, 232]], 0.3)
}
function drawCactus(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [70, 125, 45], [[60, 110, 38], [82, 142, 55]], 0.4)
  for (let y = 1; y < TILE_SIZE - 1; y += 3) {
    for (let x = 2; x < TILE_SIZE - 2; x += 4) {
      fill(ctx, ox + x, oy + y, [30, 55, 20])
    }
  }
}
function drawFlowerRed(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  for (let y = 7; y < 16; y++) fill(ctx, ox + 8, oy + y, [60, 130, 40])
  fill(ctx, ox + 7, oy + 12, [60, 130, 40])
  fill(ctx, ox + 9, oy + 10, [60, 130, 40])
  const petals = [[7,4],[8,4],[9,4],[6,5],[7,5],[8,5],[9,5],[10,5],[6,6],[7,6],[8,6],[9,6],[10,6],[7,7],[8,7],[9,7]]
  petals.forEach(([x, y]) => fill(ctx, ox + x, oy + y, [220, 40, 40]))
  fill(ctx, ox + 8, oy + 5, [255, 210, 50])
}
function drawFlowerYellow(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  for (let y = 7; y < 16; y++) fill(ctx, ox + 8, oy + y, [60, 130, 40])
  fill(ctx, ox + 7, oy + 13, [60, 130, 40])
  fill(ctx, ox + 9, oy + 11, [60, 130, 40])
  const petals = [[7,4],[8,4],[9,4],[6,5],[7,5],[8,5],[9,5],[10,5],[6,6],[7,6],[8,6],[9,6],[10,6],[7,7],[8,7],[9,7]]
  petals.forEach(([x, y]) => fill(ctx, ox + x, oy + y, [245, 210, 40]))
  fill(ctx, ox + 8, oy + 5, [220, 130, 30])
}
function drawCoalOre(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawOre(ctx, ox, oy, [45, 45, 45], [75, 75, 75])
}
function drawIronOre(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawOre(ctx, ox, oy, [195, 155, 130], [225, 185, 160])
}
function drawStairs(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawPlanks(ctx, ox, oy)
  for (let x = 0; x < TILE_SIZE; x++) {
    fill(ctx, ox + x, oy + 7, [100, 70, 35])
    fill(ctx, ox + x, oy + 15, [100, 70, 35])
  }
}
function drawSlab(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawPlanks(ctx, ox, oy)
  for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + 7, [110, 78, 42])
}
function drawFence(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawPlanks(ctx, ox, oy)
  for (let y = 0; y < TILE_SIZE; y++) {
    fill(ctx, ox + 4, oy + y, [110, 78, 42])
    fill(ctx, ox + 11, oy + y, [110, 78, 42])
  }
}
function drawDoor(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawPlanks(ctx, ox, oy)
  for (let y = 2; y <= 5; y++) {
    for (let x = 3; x <= 6; x++) fill(ctx, ox + x, oy + y, [60, 45, 25])
    for (let x = 9; x <= 12; x++) fill(ctx, ox + x, oy + y, [60, 45, 25])
  }
  fill(ctx, ox + 12, oy + 9, [230, 200, 70])
  fill(ctx, ox + 12, oy + 10, [210, 180, 50])
}
function drawLadder(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  for (let y = 0; y < TILE_SIZE; y++) {
    fill(ctx, ox + 2, oy + y, [140, 105, 55])
    fill(ctx, ox + 13, oy + y, [140, 105, 55])
  }
  for (const ry of [3, 7, 11, 15]) {
    for (let x = 3; x <= 12; x++) fill(ctx, ox + x, oy + ry, [170, 130, 70])
  }
}
function drawTnt(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (y >= 5 && y <= 10) fill(ctx, ox + x, oy + y, [240, 240, 240])
      else fill(ctx, ox + x, oy + y, Math.random() < 0.15 ? [190, 35, 25] : [215, 45, 30])
    }
  }
  const tntPixels = [
    [2,7],[3,7],[4,7],[3,8],[3,9],
    [6,7],[6,8],[6,9],[7,8],[8,7],[8,8],[8,9],
    [10,7],[11,7],[12,7],[11,8],[11,9],
  ]
  tntPixels.forEach(([x, y]) => fill(ctx, ox + x, oy + y, [20, 20, 20]))
}
function drawGlowstone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [230, 195, 110], [[255, 225, 140], [210, 170, 85], [245, 210, 125], [195, 150, 70]], 0.5)
}

// ----- New v1.2 Texture Drawers (Tiles 30-42) -----

function drawLava(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const heat = Math.sin(x * 0.6) + Math.cos(y * 0.6) + (Math.random() * 0.6)
      if (heat > 1.2) {
        fill(ctx, ox + x, oy + y, [255, 240, 100]) // bright molten core
      } else if (heat > 0.4) {
        fill(ctx, ox + x, oy + y, [245, 125, 20])  // orange magma
      } else if (heat > -0.4) {
        fill(ctx, ox + x, oy + y, [210, 45, 15])   // deep red
      } else {
        fill(ctx, ox + x, oy + y, [130, 25, 10])   // cooled crust
      }
    }
  }
}

function drawObsidian(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [24, 18, 38], [
    [15, 12, 26], [32, 22, 48], [45, 28, 68], [62, 38, 92], [12, 8, 20]
  ], 0.5)
}

function drawSandstone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [215, 195, 140], [[205, 185, 130], [225, 205, 150], [195, 175, 120]], 0.35)
}

function drawSandstoneSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawSandstone(ctx, ox, oy)
  // Strata bands
  for (let x = 0; x < TILE_SIZE; x++) {
    fill(ctx, ox + x, oy + 4, [190, 170, 115])
    fill(ctx, ox + x, oy + 11, [185, 165, 110])
    fill(ctx, ox + x, oy + 12, [175, 155, 105])
  }
}

function drawChestTop(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawPlanks(ctx, ox, oy)
  // Dark steel border
  for (let i = 0; i < TILE_SIZE; i++) {
    fill(ctx, ox + i, oy + 0, [50, 50, 50])
    fill(ctx, ox + i, oy + 15, [50, 50, 50])
    fill(ctx, ox + 0, oy + i, [50, 50, 50])
    fill(ctx, ox + 15, oy + i, [50, 50, 50])
  }
}

function drawChestSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawPlanks(ctx, ox, oy)
  // Dark steel border
  for (let i = 0; i < TILE_SIZE; i++) {
    fill(ctx, ox + i, oy + 0, [50, 50, 50])
    fill(ctx, ox + i, oy + 15, [50, 50, 50])
    fill(ctx, ox + 0, oy + i, [50, 50, 50])
    fill(ctx, ox + 15, oy + i, [50, 50, 50])
    fill(ctx, ox + i, oy + 6, [60, 60, 60]) // lid seam
  }
  // Silver/gold lock clasp
  for (let y = 5; y <= 8; y++) {
    for (let x = 7; x <= 8; x++) {
      fill(ctx, ox + x, oy + y, [220, 220, 220])
    }
  }
  fill(ctx, ox + 7, oy + 7, [40, 40, 40])
}

function drawSpawner(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  ctx.fillStyle = 'rgb(35, 38, 44)'
  ctx.fillRect(ox, oy, TILE_SIZE, TILE_SIZE)
  // Iron bars cage
  for (let i = 0; i < TILE_SIZE; i++) {
    fill(ctx, ox + i, oy + 0, [70, 75, 85])
    fill(ctx, ox + i, oy + 15, [70, 75, 85])
    fill(ctx, ox + 0, oy + i, [70, 75, 85])
    fill(ctx, ox + 15, oy + i, [70, 75, 85])
    if (i % 3 === 0) {
      for (let y = 0; y < TILE_SIZE; y++) fill(ctx, ox + i, oy + y, [60, 65, 75])
      for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + i, [60, 65, 75])
    }
  }
  // Fiery / blue core
  for (let y = 6; y <= 9; y++) {
    for (let x = 6; x <= 9; x++) {
      fill(ctx, ox + x, oy + y, Math.random() < 0.5 ? [60, 180, 240] : [240, 100, 30])
    }
  }
}

function drawMossyCobblestone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawCobblestone(ctx, ox, oy)
  // Scatter green moss
  const moss = [
    [2,3],[3,3],[3,4],[4,3],
    [7,8],[8,8],[8,9],[9,8],[9,9],[10,9],
    [12,2],[13,2],[13,3],
    [1,11],[2,11],[2,12],[3,12],[4,13],
  ]
  moss.forEach(([x, y]) => fill(ctx, ox + x, oy + y, Math.random() < 0.3 ? [50, 120, 35] : [70, 150, 45]))
}

function drawCherryLeaves(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [235, 140, 175], [
    [245, 165, 195], [225, 120, 155], [250, 185, 215], [210, 100, 140], [255, 210, 230]
  ], 0.6)
}

function drawCherryWoodTop(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const dx = x - 7.5, dy = y - 7.5
      const d = Math.sqrt(dx * dx + dy * dy)
      const ring = Math.floor(d) % 2 === 0
      fill(ctx, ox + x, oy + y, ring ? [195, 130, 135] : [175, 110, 118])
    }
  }
}

function drawCherryWoodSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let x = 0; x < TILE_SIZE; x++) {
    const base: RGB = x % 4 < 2 ? [65, 45, 52] : [78, 55, 62]
    for (let y = 0; y < TILE_SIZE; y++) {
      const isLenticel = (y % 5 === 0) && (x >= 4 && x <= 8 || x >= 11 && x <= 14)
      if (isLenticel) {
        fill(ctx, ox + x, oy + y, [110, 85, 92])
      } else {
        fill(ctx, ox + x, oy + y, Math.random() < 0.15 ? [55, 38, 44] : base)
      }
    }
  }
}

function drawRedWool(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  noisy(ctx, ox, oy, [205, 35, 30], [
    [185, 25, 22], [225, 45, 38], [170, 20, 18], [235, 55, 45]
  ], 0.4)
}

function drawLantern(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE)
  // Dark wrought-iron top & bottom
  for (let x = 3; x <= 12; x++) {
    fill(ctx, ox + x, oy + 2, [45, 45, 45])
    fill(ctx, ox + x, oy + 13, [45, 45, 45])
  }
  for (let y = 3; y <= 12; y++) {
    fill(ctx, ox + 3, oy + y, [45, 45, 45])
    fill(ctx, ox + 12, oy + y, [45, 45, 45])
  }
  // Glowing yellow/orange glass center
  for (let y = 3; y <= 12; y++) {
    for (let x = 4; x <= 11; x++) {
      const dist = Math.abs(x - 7.5) + Math.abs(y - 7.5)
      if (dist <= 3) {
        fill(ctx, ox + x, oy + y, [255, 245, 160]) // bright core
      } else {
        fill(ctx, ox + x, oy + y, Math.random() < 0.3 ? [255, 200, 80] : [240, 165, 45])
      }
    }
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
  // New v1.2 Drawers (30-42)
  drawLava, drawObsidian, drawSandstone, drawSandstoneSide, // 30-33
  drawChestTop, drawChestSide, drawSpawner, drawMossyCobblestone, // 34-37
  drawCherryLeaves, drawCherryWoodTop, drawCherryWoodSide, drawRedWool, // 38-41
  drawLantern,                                              // 42
  // Padding for tiles 43-47
  (ctx, ox, oy) => { for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [255, 0, 255]) },
  (ctx, ox, oy) => { for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [255, 0, 255]) },
  (ctx, ox, oy) => { for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) fill(ctx, ox + x, oy + y, [255, 0, 255]) },
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
