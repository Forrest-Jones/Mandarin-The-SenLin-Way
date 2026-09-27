'use strict';
const { test, expect } = require('@playwright/test');
const { go, watchErrors } = require('./helpers');

test.describe('talk', () => {
  test('a scenario opens with the tutor’s opener and two starter replies; tapping one sends it', async ({ page }) => {
    const w = watchErrors(page);
    await go(page, '#/talk/intro');
    await expect(page.locator('#chat .msg.tutor')).toHaveCount(1);
    await expect(page.locator('#chat .msg.tutor .zh')).toContainText('你叫什么名字');
    const starters = page.locator('#starters [data-starter]');
    await expect(starters).toHaveCount(2);
    await expect(starters.first()).toContainText('Nǐ hǎo');

    await starters.first().click();
    await expect(page.locator('#chat .msg.me')).toHaveCount(1);
    await expect(page.locator('#chat .msg.me')).toContainText('我叫');
    await expect(page.locator('#starters')).toHaveCount(0);
    // after the first reply the standing help chips take their place
    await expect(page.locator('[data-starter="我不知道怎么说。请帮我。"]')).toBeVisible();
    expect(w.errors()).toEqual([]);
  });

  test('every scenario carries two starters whose pinyin is tone-marked', async ({ page }) => {
    await go(page, '#/talk');
    const bad = await page.evaluate(() => window.SENLIN_SCENARIOS.flatMap(s => (s.starters || []).length === 2 ? s.starters.filter(st => !/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(st.p) || !st.zh || !st.en).map(st => s.id + ':' + st.zh) : [s.id + ': not two starters']));
    expect(bad).toEqual([]);
  });
});
