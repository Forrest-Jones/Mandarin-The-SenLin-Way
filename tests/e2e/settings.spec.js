'use strict';
const { test, expect } = require('@playwright/test');
const { go } = require('./helpers');

test.describe('settings', () => {
  test('changing the Day 1 date persists across a reload (localStorage senlin.settings)', async ({ page }) => {
    await go(page, '#/settings');
    const start = page.locator('#start');
    await expect(start).toHaveAttribute('type', 'date');
    const original = await start.inputValue();
    const wanted = original === '2025-06-02' ? '2025-06-09' : '2025-06-02';

    await start.fill(wanted);
    await start.dispatchEvent('change');
    await expect(start).toHaveValue(wanted);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('senlin.settings') || '{}'));
    expect(stored.startDate).toBe(wanted);

    await page.reload();
    await go(page, '#/settings');
    await expect(page.locator('#start')).toHaveValue(wanted);
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem('senlin.settings') || '{}'));
    expect(again.startDate).toBe(wanted);

    // the rest of the app follows the new calendar
    await go(page, '#/levels');
    await expect(page.locator('#app')).toContainText(/HSK 1/);
  });
});
