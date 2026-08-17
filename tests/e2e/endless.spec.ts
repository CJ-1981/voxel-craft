// E2E tests for the endless (chunk-streamed) world and the corner minimap.
// Runs against the dev server started by playwright's webServer config.

import { test, expect } from '@playwright/test'

interface GameWindow {
  world: {
    chunkCount: number
    isChunkLoaded: (x: number, z: number) => boolean
    highestBlockY: (x: number, z: number) => number
    getBlock: (x: number, y: number, z: number) => string
    setBlockAndUpdate: (scene: unknown, x: number, y: number, z: number, t: string) => void
    blockIdToType: (id: number) => string | null
    save: (p?: unknown) => boolean
  }
  player: { position: { set: (x: number, y: number, z: number) => void } }
  scene: unknown
  minimap: { zoom: number }
}

async function startCreative(page: import('@playwright/test').Page) {
  await page.goto('/voxel-craft', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('voxelcraft_settings', JSON.stringify({ unlimitedMap: true }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('button:has-text("New Creative Game")').click()
  // Wait for the game handle + streaming to settle a little.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __game?: { world: { chunkCount: number } } }).__game?.world.chunkCount ?? 0), {
      timeout: 30000,
    })
    .toBeGreaterThan(50)
}

test.describe('Endless world + minimap', () => {
  test('streams chunks around the player and unloads distant ones', async ({ page }) => {
    await startCreative(page)

    // Beyond the legacy 208-block limit there is still terrain.
    const loaded = await page.evaluate(() => {
      const g = (window as unknown as { __game: GameWindow }).__game
      const ground = g.world.highestBlockY(2000, 2000)
      g.player.position.set(2000.5, ground + 2, 2000.5)
      return ground
    })
    expect(loaded).toBeGreaterThan(0)

    // Streaming brings the far area in (headless WebGL is slow — be patient).
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __game: GameWindow }).__game.world.isChunkLoaded(2000, 2000)), {
        timeout: 60000,
      })
      .toBe(true)

    // Chunk count stays bounded (far chunks around spawn were unloaded) but
    // climbs back as streaming fills the area in (2 chunks/frame in headless).
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __game: GameWindow }).__game.world.chunkCount), {
        timeout: 90000,
      })
      .toBeGreaterThan(50)
    const count = await page.evaluate(() => (window as unknown as { __game: GameWindow }).__game.world.chunkCount)
    expect(count).toBeLessThan(300)
  })

  test('player edits survive chunk unload + regeneration', async ({ page }) => {
    await startCreative(page)

    // Place a gold block next to spawn.
    const placed = await page.evaluate(() => {
      const g = (window as unknown as { __game: GameWindow }).__game
      const x = 100, z = 100
      const y = g.world.highestBlockY(x, z) + 1
      g.world.setBlockAndUpdate(g.scene, x, y, z, 'gold')
      return { x, y, z }
    })

    // Walk far away until the spawn chunk unloads.
    await page.evaluate(() => {
      const g = (window as unknown as { __game: GameWindow }).__game
      const ground = g.world.highestBlockY(900, 900)
      g.player.position.set(900.5, ground + 2, 900.5)
    })
    await expect
      .poll(() => page.evaluate(() => !(window as unknown as { __game: GameWindow }).__game.world.isChunkLoaded(100, 100)), {
        timeout: 60000,
      })
      .toBe(true)

    // Come back — the edit must still be there (edits overlay reapplied).
    await page.evaluate(() => {
      const g = (window as unknown as { __game: GameWindow }).__game
      const ground = g.world.highestBlockY(100, 100)
      g.player.position.set(100.5, ground + 2, 100.5)
    })
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __game: GameWindow }).__game.world.isChunkLoaded(100, 100)), {
        timeout: 60000,
      })
      .toBe(true)
    const stillThere = await page.evaluate((p) => {
      return (window as unknown as { __game: GameWindow }).__game.world.getBlock(p.x, p.y, p.z)
    }, placed)
    expect(stillThere).toBe('gold')
  })

  test('minimap renders and zooms with M', async ({ page }) => {
    await startCreative(page)

    const minimap = page.locator('[data-testid="minimap"]')
    await expect(minimap).toBeVisible()

    // The map should be painted with terrain colors, not just background.
    const painted = await page.evaluate(() => {
      const cv = document.querySelector('[data-testid="minimap"]') as HTMLCanvasElement
      const ctx = cv.getContext('2d')!
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data
      // Background is #10141f — count pixels that differ meaningfully.
      let colored = 0
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - 16) + Math.abs(d[i + 1] - 20) + Math.abs(d[i + 2] - 31) > 40) colored++
      }
      return colored
    })
    expect(painted).toBeGreaterThan(500)

    // M cycles the zoom.
    const zoomOf = () =>
      page.evaluate(() => (window as unknown as { __game?: { minimap: { zoom: number } } }).__game?.minimap.zoom ?? null)
    const before = await zoomOf()
    await page.keyboard.press('m')
    await page.waitForTimeout(300)
    const after = await zoomOf()
    expect(after).not.toBe(before)
  })

  test('saves to the v2 format and migrates v1 snapshots', async ({ page }) => {
    test.setTimeout(240000)
    await startCreative(page)

    // ---- v2 save round-trip ----
    const saved = await page.evaluate(() => {
      const g = (window as unknown as { __game: GameWindow }).__game
      return g.world.save({ x: 104.5, y: 30, z: 104.5, yaw: 0, pitch: 0 })
    })
    expect(saved).toBe(true)
    const v2 = await page.evaluate(() => {
      const raw = localStorage.getItem('voxelcraft_world_v2')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return { v: parsed.v as number, editChunks: Object.keys(parsed.edits ?? {}).length }
    })
    expect(v2?.v).toBe(2)
    expect((v2?.editChunks ?? 0)).toBeGreaterThan(0)

    // ---- synthesize a v1 snapshot from current terrain + one deliberate edit ----
    await page.evaluate(() => {
      const g = (window as unknown as { __game: GameWindow }).__game
      const X = 208, Y = 48, Z = 208
      // Ensure every legacy chunk is generated, then copy raw ids out.
      const goldId = 13
      if (g.world.blockIdToType(goldId) !== 'gold') throw new Error('gold id drifted')
      const arr = new Uint8Array(X * Y * Z)
      const v1idx = (x: number, y: number, z: number) => x + z * X + y * X * Z
      for (let cz = 0; cz < 13; cz++) {
        for (let cx = 0; cx < 13; cx++) {
          g.world.highestBlockY(cx * 16, cz * 16) // forces generation
        }
      }
      // Fill via evaluate is slow block-by-block; read chunk arrays instead.
      const w = g.world as unknown as { getChunkData: (cx: number, cz: number) => Uint8Array | null }
      for (let cz = 0; cz < 13; cz++) {
        for (let cx = 0; cx < 13; cx++) {
          const d = w.getChunkData(cx, cz)!
          for (let y = 0; y < Y; y++) {
            for (let lz = 0; lz < 16; lz++) {
              for (let lx = 0; lx < 16; lx++) {
                arr[v1idx(cx * 16 + lx, y, cz * 16 + lz)] = d[lx + lz * 16 + y * 256]
              }
            }
          }
        }
      }
      // Deliberate edit at (10, 30, 10).
      arr[v1idx(10, 30, 10)] = goldId

      // Base64-encode.
      let bin = ''
      const step = 0x8000
      for (let i = 0; i < arr.length; i += step) {
        bin += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + step)) as unknown as number[])
      }
      localStorage.setItem('voxelcraft_world_v1', btoa(bin))
      localStorage.setItem(
        'voxelcraft_meta_v1',
        JSON.stringify({ seed: (g.world as unknown as { seed: number }).seed, savedAt: Date.now(), playerX: 104.5, playerY: 40, playerZ: 104.5, playerYaw: 0, playerPitch: 0 }),
      )
      localStorage.removeItem('voxelcraft_world_v2')
      localStorage.removeItem('voxelcraft_meta_v2')
      localStorage.removeItem('voxelcraft_chests_v2')
    })

    // Reload: migration should run at world init.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    const migrated = await page.evaluate(() => {
      const g = (window as unknown as { __game: GameWindow }).__game
      // Force-generate the chunk containing the deliberate edit.
      g.world.highestBlockY(10, 10)
      return {
        v2Present: !!localStorage.getItem('voxelcraft_world_v2'),
        v1Gone: !localStorage.getItem('voxelcraft_world_v1'),
        edit: g.world.getBlock(10, 30, 10),
      }
    })
    expect(migrated.v2Present).toBe(true)
    expect(migrated.v1Gone).toBe(true)
    expect(migrated.edit).toBe('gold')
  })
})
