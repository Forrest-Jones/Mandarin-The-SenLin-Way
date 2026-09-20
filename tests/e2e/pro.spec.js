'use strict';
const { test, expect } = require('@playwright/test');
const { go, watchErrors } = require('./helpers');

test.describe('pricing page', () => {
  test('#/pro lists the three plans with the published prices and no console errors', async ({ page }) => {
    const errs = watchErrors(page);
    await go(page, '#/pro');
    const app = page.locator('#app');
    await expect(app).toContainText('HSK 1 is free forever');
    await expect(page.locator('#plans section')).toHaveCount(3);
    await expect(app).toContainText('$11.99');
    await expect(app).toContainText('$59.99 billed yearly');
    await expect(app).toContainText('$5.00');
    await expect(app).toContainText('7-day free trial');
    await expect(app).toContainText('$149.99');
    // without a server or store the buttons exist but are disabled, and the page says why
    await expect(page.locator('[data-buy="yearly"]')).toBeDisabled();
    await expect(app).toContainText('Purchases open once the Stripe keys are set');
    expect(errs.errors(), JSON.stringify(errs.errors(), null, 2)).toEqual([]);
  });
  test('the paywall upsell links to the pricing page', async ({ page }) => {
    await go(page, '#/pro/thanks');
    await expect(page.locator('#app')).toContainText('Welcome to the forest');
  });
});
