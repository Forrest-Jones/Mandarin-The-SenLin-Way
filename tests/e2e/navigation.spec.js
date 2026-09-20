'use strict';
const { test, expect } = require('@playwright/test');
const { NAV, watchErrors, go } = require('./helpers');

test.describe('navigation', () => {
  for (const [hash, route] of NAV) {
    test(`${hash} renders content and marks "${route}" as the current nav link`, async ({ page }) => {
      const errs = watchErrors(page);
      await go(page, hash);
      const text = (await page.locator('#app').innerText()).trim();
      expect(text.length, `#app is empty on ${hash}`).toBeGreaterThan(20);
      const active = page.locator(`nav.nav a[data-route="${route}"]`);
      await expect(active).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('nav.nav a[aria-current="page"]')).toHaveCount(1);
      expect(errs.errors(), JSON.stringify(errs.errors(), null, 2)).toEqual([]);
    });
  }

  test('clicking through the nav switches views without a reload', async ({ page }) => {
    await go(page, '#/');
    const marker = await page.evaluate(() => { window.__senlinMarker = Math.random(); return window.__senlinMarker; });
    for (const [, route] of NAV.slice(1, 4)) {
      await page.locator(`nav.nav a[data-route="${route}"]`).click();
      await expect(page.locator(`nav.nav a[data-route="${route}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#app')).not.toBeEmpty();
    }
    expect(await page.evaluate(() => window.__senlinMarker)).toBe(marker);
  });
});
