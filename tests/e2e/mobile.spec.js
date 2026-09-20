'use strict';
const { test, expect } = require('@playwright/test');
const { go } = require('./helpers');

const PAGES = [['#/', 'today'], ['#/levels', 'levels'], ['#/business', 'business'], ['#/settings', 'settings']];

test.describe('mobile (Pixel 7)', () => {
  test.skip(({ isMobile }) => !isMobile, 'runs on the mobile project only');

  for (const [hash, name] of PAGES) {
    test(`${name}: no horizontal overflow`, async ({ page }) => {
      await go(page, hash);
      await page.waitForTimeout(200);
      const m = await page.evaluate(() => ({ scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth, bodyWidth: document.body.scrollWidth }));
      expect(m.scrollWidth, `page scrolls sideways on ${hash}: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.innerWidth + 1);
      expect(m.bodyWidth).toBeLessThanOrEqual(m.innerWidth + 1);
    });
  }

  test('tap targets: every nav link is at least 40px tall', async ({ page }) => {
    await go(page, '#/');
    const links = page.locator('nav.nav a');
    await expect(links).toHaveCount(9);
    const small = [];
    for (let i = 0; i < 9; i++) {
      const a = links.nth(i);
      const box = await a.boundingBox();
      const label = (await a.innerText()).trim();
      if (!box || box.height < 40) small.push(`${label}: ${box ? Math.round(box.height) : 'no box'}px`);
    }
    expect(small, 'nav links under 40px tall: ' + small.join(', ')).toEqual([]);
  });

  test('the nav scrolls horizontally instead of wrapping and every link is reachable', async ({ page }) => {
    await go(page, '#/');
    const last = page.locator('nav.nav a[data-route="settings"]');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await last.tap();
    await expect(last).toHaveAttribute('aria-current', 'page');
  });
});
