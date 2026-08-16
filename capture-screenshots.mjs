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
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 810 },
      deviceScaleFactor: 1.5,
    });

    const page = await desktopContext.newPage();

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

    const waitForWorldReady = async (p) => {
      await p.waitForFunction(() => {
        const g = window.__game;
        return g && g.world && g.world.meshProgress >= 1;
      }, { timeout: 30000 });
      await p.waitForTimeout(1000);
    };

    // 1. Start Screen
    console.log('1/8: Capturing start-screen.png...');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await injectStyles(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/start-screen.png` });

    // 2. Gameplay (Seoul)
    console.log('2/8: Capturing gameplay.png...');
    const survivalBtn = page.locator('button:has-text("New Survival Game")');
    await survivalBtn.waitFor({ state: 'visible', timeout: 10000 });
    await survivalBtn.click();
    await waitForWorldReady(page);
    await injectStyles(page);

    await page.evaluate(() => {
      const g = window.__game;
      if (g) {
        g.player.position.set(104.5, 26, 104.5);
        g.player.yaw = 2.1;
        g.player.pitch = -0.15;
        g.dayNight.timeOfDay = 0.42;
        g.dayNight.paused = true;
      }
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/gameplay.png` });

    // 3. Chest UI
    console.log('3/8: Capturing chest.png...');
    await page.evaluate(() => {
      const g = window.__game;
      if (g) {
        // Place chest 2 blocks in front of player
        const forward = { x: -Math.sin(g.player.yaw), z: -Math.cos(g.player.yaw) };
        const px = Math.floor(g.player.position.x + forward.x * 2);
        const py = Math.floor(g.player.position.y);
        const pz = Math.floor(g.player.position.z + forward.z * 2);
        g.world.setBlockAndUpdate(g.scene, px, py, pz, 'chest');
        
        const canvas = document.querySelector('canvas');
        if (canvas) {
          canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
        }
      }
    });
    await page.waitForTimeout(800);
    await injectStyles(page);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/chest.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 4. Tokyo Megacity Map Panorama
    console.log('4/8: Capturing tokyo.png...');
    const pageTokyo = await desktopContext.newPage();
    await pageTokyo.goto(url, { waitUntil: 'domcontentloaded' });
    await injectStyles(pageTokyo);
    await pageTokyo.waitForTimeout(1000);

    // Select Tokyo map
    const tokyoMapBtn = pageTokyo.locator('button:has-text("Tokyo")');
    await tokyoMapBtn.click();
    await pageTokyo.waitForTimeout(300);

    const creativeBtn = pageTokyo.locator('button:has-text("New Creative Game")');
    await creativeBtn.click();
    await waitForWorldReady(pageTokyo);
    await injectStyles(pageTokyo);

    await pageTokyo.evaluate(() => {
      const g = window.__game;
      if (g) {
        g.dayNight.timeOfDay = 0.72; // Golden sunset
        g.dayNight.paused = true;
        g.player.flying = true;
        g.player.position.set(104, 38, 104);
        g.player.yaw = 0.8;
        g.player.pitch = -0.32;
      }
    });
    await pageTokyo.waitForTimeout(2000);
    await pageTokyo.screenshot({ path: `${SCREENSHOTS_DIR}/tokyo.png` });

    // 5. Night Scene
    console.log('5/8: Capturing night.png...');
    await pageTokyo.evaluate(() => {
      const g = window.__game;
      if (g) {
        g.dayNight.timeOfDay = 0.03; // Starfield and moon
        g.dayNight.paused = true;
        g.player.flying = true;
        g.player.position.set(104, 24, 104);
        g.player.pitch = 0.05;
        g.player.yaw = 2.4;
      }
    });
    await pageTokyo.waitForTimeout(2000);
    await pageTokyo.screenshot({ path: `${SCREENSHOTS_DIR}/night.png` });
    await pageTokyo.close();

    // 6. Inventory UI
    console.log('6/8: Capturing inventory.png...');
    await page.keyboard.press('e');
    await page.waitForTimeout(1000);
    await injectStyles(page);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/inventory.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 7. Settings Modal
    console.log('7/8: Capturing settings.png...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const settingsBtn = page.locator('div.backdrop-blur-sm button:has-text("Settings")');
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(600);
      await injectStyles(page);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/settings.png` });
    }

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
    await mobilePage.goto(url, { waitUntil: 'domcontentloaded' });
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
        g.player.position.set(104.5, 26, 104.5);
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
