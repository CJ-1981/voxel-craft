import { test, expect } from '@playwright/test'

test.describe('VoxelCraft Game', () => {
  test('page loads with canvas element', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })
  })

  test('shows start screen with game title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // Check for title
    await expect(page.locator('h1:has-text("VOXELCRAFT")')).toBeVisible()

    // Check for game mode buttons
    await expect(page.locator('button:has-text("New Survival Game")')).toBeVisible()
    await expect(page.locator('button:has-text("New Creative Game")')).toBeVisible()
  })

  test('starts game when New Survival Game button is clicked', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()

    // Wait for game to start
    await page.waitForTimeout(2000)

    // Crosshair should appear indicating game is running
    const crosshair = page.locator('[data-testid="crosshair"]')
    await expect(crosshair).toBeVisible({ timeout: 5000 })
  })

  test('shows game menu when paused', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)

    // Press Escape to open menu
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Check for menu elements
    await expect(page.locator('text=Resume')).toBeVisible()
    await expect(page.locator('text=Restart Game')).toBeVisible()
  })

  test('can open inventory with E key', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)

    // Press E to open inventory
    await page.keyboard.press('e')
    await page.waitForTimeout(500)

    // Check for inventory UI title (h2 with Inventory text)
    await expect(page.locator('h2:has-text("Inventory")')).toBeVisible()

    // Close inventory
    await page.keyboard.press('e')
    await page.waitForTimeout(500)

    // Inventory should be closed
    await expect(page.locator('h2:has-text("Inventory")')).not.toBeVisible()
  })

  test('hotbar slots are visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)

    // Check for hotbar elements
    const hotbarSlots = page.locator('[data-testid="hotbar-slot"]')
    const count = await hotbarSlots.count()

    // Should have 12 hotbar slots
    expect(count).toBe(12)
  })

  test('displays HUD elements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)

    // Check for crosshair
    const crosshair = page.locator('[data-testid="crosshair"]')
    await expect(crosshair).toBeVisible()

    // Check for FPS counter
    const fpsCounter = page.locator('text=/FPS/i')
    await expect(fpsCounter).toBeVisible()
  })

  test('mobile page loads correctly', async ({ page }) => {
    // Emulate mobile device
    await page.setViewportSize({ width: 375, height: 667 })
    await page.emulateMedia({ media: 'screen' })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // On mobile, the page should still load without errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()

    // Game title should be visible
    await expect(page.locator('h1:has-text("VOXELCRAFT")')).toBeVisible()
  })

  test('can pause and resume game', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)

    // Crosshair should be visible when playing
    await expect(page.locator('[data-testid="crosshair"]')).toBeVisible()

    // Pause with Escape
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Menu should appear
    await expect(page.locator('text=Resume')).toBeVisible()

    // Resume
    const resumeButton = page.locator('button:has-text("Resume")')
    await resumeButton.click()
    await page.waitForTimeout(500)

    // Crosshair should be visible again
    await expect(page.locator('[data-testid="crosshair"]')).toBeVisible()
  })

  test('can restart game from menu', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)

    // Open menu
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Click Restart
    const restartButton = page.locator('button:has-text("Restart Game")')
    await restartButton.click()
    await page.waitForTimeout(1000)

    // Should be back on title screen
    await expect(page.locator('button:has-text("New Survival Game")')).toBeVisible()
  })

  test('creative mode button works', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Creative Game")')
    await playButton.click()

    // Wait for game to start
    await page.waitForTimeout(2000)

    // Crosshair should appear
    const crosshair = page.locator('[data-testid="crosshair"]')
    await expect(crosshair).toBeVisible({ timeout: 5000 })

    // Check for creative mode indicator in HUD
    await expect(page.locator('text=Mode: creative')).toBeVisible()
  })
})
