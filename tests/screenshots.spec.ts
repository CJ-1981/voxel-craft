import { test, expect } from '@playwright/test'

test.describe('Screenshot Capture', () => {
  test('capture start screen', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'docs/screenshots/start-screen.png', fullPage: true })
  })

  test('capture gameplay', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'docs/screenshots/gameplay.png', fullPage: true })
  })

  test('capture inventory', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)
    await page.keyboard.press('e')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'docs/screenshots/inventory.png', fullPage: true })
  })

  test('capture menu', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'docs/screenshots/menu.png', fullPage: true })
  })

  test('capture hotbar', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'docs/screenshots/hotbar.png' })
  })

  test('capture settings', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
    const playButton = page.locator('button:has-text("New Survival Game")')
    await playButton.click()
    await page.waitForTimeout(2000)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const settingsButton = page.locator('button:has-text("Settings")')
    await settingsButton.first().click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'docs/screenshots/settings.png', fullPage: true })
  })
})
