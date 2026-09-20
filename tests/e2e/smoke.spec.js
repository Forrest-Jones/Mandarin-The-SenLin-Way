'use strict';
const { test, expect } = require('@playwright/test');
const { watchErrors, go } = require('./helpers');

test.describe('smoke', () => {
  test('home loads with the brand, nine nav links and no console errors', async ({ page }) => {
    const errs = watchErrors(page);
    await go(page, '#/');
    await expect(page).toHaveTitle(/Mandarin The SenLin Way/);
    await expect(page.locator('header .brand')).toContainText('Mandarin The SenLin Way');
    await expect(page.locator('header .brand .mark')).toHaveText('森');
    await expect(page.locator('nav.nav a')).toHaveCount(9);
    await expect(page.locator('#app')).not.toBeEmpty();
    // let late errors (service worker, deferred scripts) surface
    await page.waitForTimeout(500);
    expect(errs.errors(), 'unexpected console errors / page errors:\n' + JSON.stringify(errs.errors(), null, 2)).toEqual([]);
  });
});
