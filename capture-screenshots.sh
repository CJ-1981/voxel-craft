#!/bin/bash

# Kill any existing dev server
pkill -f "next dev" 2>/dev/null

# Start dev server in background
echo "Starting dev server..."
npm run dev > dev.log 2>&1 &
DEV_PID=$!
echo "Dev server started with PID: $DEV_PID"

# Wait for server to be ready
echo "Waiting for server to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  sleep 1
done

# Create screenshots directory
mkdir -p docs/screenshots

# Use Playwright to capture screenshots
echo "Capturing screenshots with Playwright..."

npx playwright codegen --device="Desktop Chrome" --target=javascript http://localhost:3000 /dev/null 2>/dev/null

# Manual screenshot capture using Node and Playwright
cat > /tmp/capture-screenshots.mjs << 'EOF'
import { chromium } from 'playwright';
import { mkdir } from 'fs';
import { dirname } from 'path';

const SCREENSHOTS_DIR = 'docs/screenshots';

async function captureScreenshots() {
  mkdir(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    console.log('Capturing screenshots...');

    // 1. Start screen
    console.log('1/6: Start screen');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/start-screen.png`, fullPage: true });

    // 2. Gameplay
    console.log('2/6: Gameplay');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("New Survival Game")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/gameplay.png`, fullPage: true });

    // 3. Inventory
    console.log('3/6: Inventory');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("New Survival Game")');
    await page.waitForTimeout(2000);
    await page.keyboard.press('e');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/inventory.png`, fullPage: true });

    // 4. Menu
    console.log('4/6: Menu');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("New Survival Game")');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/menu.png`, fullPage: true });

    // 5. Hotbar
    console.log('5/6: Hotbar');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("New Survival Game")');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/hotbar.png` });

    // 6. Settings
    console.log('6/6: Settings');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("New Survival Game")');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/settings.png`, fullPage: true });

    console.log('All screenshots captured successfully!');
    console.log(`Location: ${SCREENSHOTS_DIR}/`);

  } catch (error) {
    console.error('Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
EOF

node /tmp/capture-screenshots.mjs

echo "Screenshots captured!"

# Clean up
kill $DEV_PID 2>/dev/null
