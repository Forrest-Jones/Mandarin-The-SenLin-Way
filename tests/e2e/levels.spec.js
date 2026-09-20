'use strict';
const { test, expect } = require('@playwright/test');
const { go } = require('./helpers');

// A date as toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) prints it (en-GB or en-US).
const DATE = /\b(?:\d{1,2} )?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? ?(?:\d{1,2},? )?\d{4}\b/;

test.describe('levels', () => {
  test('lists HSK 1 to 6, each with a date', async ({ page }) => {
    await go(page, '#/levels');
    const app = page.locator('#app');
    for (let n = 1; n <= 6; n++) await expect(app).toContainText(`HSK ${n}`);

    // the overview table: one row per level, with a finish date in it
    const rows = page.locator('#app table tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(6);
    for (let n = 1; n <= 6; n++) {
      const row = rows.nth(n - 1);
      await expect(row).toBeVisible();
      const text = await row.innerText();
      expect(text.startsWith(`HSK ${n}`), `row ${n} is "${text.slice(0, 20)}"`).toBe(true);
      expect(text, `HSK ${n} row has no date`).toMatch(DATE);
    }
    // and the level cards (CEFR labels) are there too
    for (const cefr of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) await expect(app).toContainText(cefr);
  });
});
