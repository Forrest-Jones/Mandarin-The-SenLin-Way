'use strict';
const { test, expect } = require('@playwright/test');
const { watchErrors, go } = require('./helpers');

test.describe('lesson runner', () => {
  test('#/lesson/13 shows the timer, a segment title and a next control; one step advances', async ({ page }) => {
    const errs = watchErrors(page);
    await go(page, '#/lesson/13');

    // timed runner chrome
    await expect(page.locator('#clock')).toHaveText(/^\+?\d+:\d\d$/);
    const segButtons = page.locator('#segments button');
    expect(await segButtons.count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('#segments button.active')).toHaveCount(1);
    await expect(page.locator('#segments button.active')).toContainText(/\S/);

    // segment title + step indicator
    const head = page.locator('#segment .seg-head');
    await expect(head.locator('h2')).toContainText(/\S/);
    await expect(head.locator('.eyebrow')).toContainText(/Day 13 · 1 of \d+/);

    // a Start / Next control
    const next = page.locator('#segment #next, #segment button:has-text("Start"), #segment button:has-text("Next")').first();
    await expect(next).toBeVisible();
    await expect(next).toContainText(/Start|Next|→/);

    // click through one step
    const before = await head.locator('h2').innerText();
    await next.click();
    await expect(page.locator('#segment .seg-head .eyebrow')).toContainText(/Day 13 · 2 of \d+/);
    const after = await page.locator('#segment .seg-head h2').innerText();
    expect(after).not.toBe(before);
    await expect(page.locator('#segments button.done')).toHaveCount(1);

    // exit returns to Today
    await page.locator('a.btn:has-text("Exit")').click();
    await expect(page.locator('nav.nav a[data-route="today"]')).toHaveAttribute('aria-current', 'page');
    expect(errs.errors(), JSON.stringify(errs.errors(), null, 2)).toEqual([]);
  });
});
