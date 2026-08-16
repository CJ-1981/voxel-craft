import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const SCREENSHOTS_DIR = 'docs/screenshots';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function capture() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const url = 'http://localhost:3000/voxel-craft';

  try {
    // Desktop context
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 810 },
      deviceScaleFactor: 1.5,
    });

    const page = await desktopContext.newPage();

    // Helper to hide Next.js dev toast/watermark
    const injectStyles = async (p) => {
      await p.addStyleTag({
        content: `
          nextjs-portal, [data-nextjs-toast-wrapper], #__next-build-watcher, [data-nextjs-dialog-overlay] {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
          }
        `
      });
    };

    // Helper to wait until world meshing is 100% complete
    const waitForWorldReady = async (p) => {
      await p.waitForFunction(() => {
        const g = window.__game;
        return g && g.world && g.world.meshProgress >= 1;
      }, { timeout: 30000 });
      await p.waitForTimeout(1000);
    };

    // 1. Start Screen
    console.log('1/8: Capturing start-screen.png...');
    await page.goto(url, { waitUntil: 'networkidle' });
    await injectStyles(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/start-screen.png` });

    // 2. Gameplay (Survival Mode, Daylight)
    console.log('2/8: Capturing gameplay.png...');
    const survivalBtn = page.locator('button:has-text("New Survival Game")');
    await survivalBtn.waitFor({ state: 'visible', timeout: 10000 });
    await survivalBtn.click();
    await waitForWorldReady(page);
    await injectStyles(page);

    await page.evaluate(() => {
      const g = window.__game;
      if (g) {
        const world = g.world;
        const getTop = (x, z) => {
          for (let y = 47; y >= 0; y--) {
            const b = world.getBlock(x, y, z);
            if (b && b !== 'air' && b !== 'water' && b !== 'leaves') return y;
          }
          return 15;
        };

        let bestX = 104, bestZ = 104, maxY = 0;
        for (let x = 70; x < 140; x += 3) {
          for (let z = 70; z < 140; z += 3) {
            const h = getTop(x, z);
            if (h > maxY && h < 32) {
              maxY = h;
              bestX = x;
              bestZ = z;
            }
          }
        }

        g.player.position.set(bestX + 0.5, maxY + 2.6, bestZ + 0.5);
        g.player.yaw = 2.1;
        g.player.pitch = -0.15;
        g.dayNight.timeOfDay = 0.42; // Clear sunny day
        g.dayNight.paused = true;
        g.selectedHotbarIndex = 0;
      }
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/gameplay.png` });

    // 3. Inventory
    console.log('3/8: Capturing inventory.png...');
    await page.keyboard.press('e');
    await page.waitForTimeout(1000);
    await injectStyles(page);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/inventory.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 4. Pause Menu
    console.log('4/8: Capturing menu.png...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await injectStyles(page);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/menu.png` });

    // 5. Settings Modal
    console.log('5/8: Capturing settings.png...');
    const settingsBtn = page.locator('div.backdrop-blur-sm button:has-text("Settings")');
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(600);
      await injectStyles(page);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/settings.png` });
    }

    // 6. Creative / Scenic Panorama
    console.log('6/8: Capturing creative.png...');
    const pageCreative = await desktopContext.newPage();
    await pageCreative.goto(url, { waitUntil: 'networkidle' });
    await injectStyles(pageCreative);
    await pageCreative.waitForTimeout(1000);
    const creativeBtn = pageCreative.locator('button:has-text("New Creative Game")');
    await creativeBtn.waitFor({ state: 'visible', timeout: 10000 });
    await creativeBtn.click();
    await waitForWorldReady(pageCreative);
    await injectStyles(pageCreative);

    await pageCreative.evaluate(() => {
      const g = window.__game;
      if (g) {
        g.dayNight.timeOfDay = 0.72; // Golden hour / sunset
        g.dayNight.paused = true;
        g.player.flying = true;
        g.player.position.set(104, 38, 104);
        g.player.yaw = 0.8;
        g.player.pitch = -0.32;
      }
    });
    await pageCreative.waitForTimeout(2000);
    await pageCreative.screenshot({ path: `${SCREENSHOTS_DIR}/creative.png` });

    // 7. Night Scene
    console.log('7/8: Capturing night.png...');
    await pageCreative.evaluate(() => {
      const g = window.__game;
      if (g) {
        g.dayNight.timeOfDay = 0.03; // Night with stars & moon
        g.dayNight.paused = true;
        g.player.flying = true;
        g.player.position.set(104, 24, 104);
        g.player.pitch = 0.05; // look towards moon and horizon
        g.player.yaw = 2.4;
      }
    });
    await pageCreative.waitForTimeout(2000);
    await pageCreative.screenshot({ path: `${SCREENSHOTS_DIR}/night.png` });

    await pageCreative.close();
    await page.close();
    await desktopContext.close();

    // 8. Mobile Controls View
    console.log('8/8: Capturing mobile.png...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(url, { waitUntil: 'networkidle' });
    await injectStyles(mobilePage);
    await mobilePage.waitForTimeout(1500);
    const mobilePlay = mobilePage.locator('button:has-text("New Survival Game")');
    await mobilePlay.waitFor({ state: 'visible', timeout: 10000 });
    await mobilePlay.click();
    await waitForWorldReady(mobilePage);
    await injectStyles(mobilePage);

    await mobilePage.evaluate(() => {
      const g = window.__game;
      if (g) {
        g.dayNight.timeOfDay = 0.45;
        g.dayNight.paused = true;
        const world = g.world;
        const getTop = (x, z) => {
          for (let y = 47; y >= 0; y--) {
            const b = world.getBlock(x, y, z);
            if (b && b !== 'air' && b !== 'water' && b !== 'leaves') return y;
          }
          return 15;
        };

        let bestX = 104, bestZ = 104, maxY = 0;
        for (let x = 80; x < 130; x += 4) {
          for (let z = 80; z < 130; z += 4) {
            const h = getTop(x, z);
            if (h > maxY && h < 32) {
              maxY = h;
              bestX = x;
              bestZ = z;
            }
          }
        }

        g.player.position.set(bestX + 0.5, maxY + 2.6, bestZ + 0.5);
        g.player.yaw = 2.1;
        g.player.pitch = -0.15;
      }
    });
    await mobilePage.waitForTimeout(2000);
    await mobilePage.screenshot({ path: `${SCREENSHOTS_DIR}/mobile.png` });

    await mobilePage.close();
    await mobileContext.close();

    console.log('All 8 screenshots captured successfully in docs/screenshots/!');
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
  }
}

capture();
