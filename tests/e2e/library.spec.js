'use strict';
const { test, expect } = require('@playwright/test');
const { go } = require('./helpers');

test.describe('library', () => {
  test('search finds 你好 among the words', async ({ page }) => {
    await go(page, '#/library/words');
    const search = page.locator('#search');
    await expect(search).toBeVisible();
    const total = await page.locator('#lib [data-q]').count();
    expect(total).toBeGreaterThan(10);

    await search.fill('你好');
    const visible = page.locator('#lib [data-q]:visible');
    await expect(visible.first()).toContainText('你好');
    const n = await visible.count();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThan(total);
    for (const t of await visible.allInnerTexts()) expect(t).toContain('你好');

    // pinyin search works too, and clearing restores everything
    await search.fill('nǐ hǎo');
    await expect(page.locator('#lib [data-q]:visible').first()).toContainText('你好');
    await search.fill('');
    await expect(page.locator('#lib [data-q]:visible')).toHaveCount(total);
  });

  test('the characters tab finds 你 and opens its scene', async ({ page }) => {
    await go(page, '#/library');
    await page.locator('#search').fill('你');
    const tile = page.locator('#lib [data-open="你"]');
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page.locator('#dialog')).toBeVisible();
    await expect(page.locator('#dialog')).toContainText('你');
  });
});
