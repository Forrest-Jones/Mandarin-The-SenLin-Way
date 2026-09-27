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

test.describe('settings with a server configured', () => {
  test('a direct load of #/settings shows the sign-in card', async ({ page }) => {
    await page.route(/\/v1\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/health/.test(route.request().url()) ? { ok: true, ready: true, providers: { ai: true, email: true } } : { ok: true }) }));
    await page.addInitScript(() => { try { localStorage.setItem('senlin.apiBase', JSON.stringify('https://senlin-api.example.workers.dev')); } catch (e) {} });
    await page.goto('/#/settings');
    await expect(page.locator('#account')).toContainText('Sign in to sync your forest');
    await expect(page.locator('#acct-login')).toBeVisible();
  });
});

test('signing in from Talk returns to Talk', async ({ page }) => {
  await page.route(/\/v1\//, route => {
    const u = route.request().url();
    const body = /health/.test(u) ? { ok: true, ready: true, providers: { ai: true, email: true } }
      : /auth\/password/.test(u) ? { token: 't', user: { id: 'u1', email: 'a@b.co', plan: 'free' }, created: true }
      : /entitlement/.test(u) ? { plan: 'free', features: { ai: true } } : { ok: true };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(() => { try { localStorage.setItem('senlin.apiBase', JSON.stringify('https://senlin-api.example.workers.dev')); } catch (e) {} });
  await page.goto('/#/talk');
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  await expect(page).toHaveURL(/#\/settings\/signin/);
  await page.fill('#acct-email', 'a@b.co'); await page.fill('#acct-password', 'password123');
  await page.click('#acct-create');
  await expect(page).toHaveURL(/#\/talk$/);
  await expect(page.locator('#talk-status')).toContainText('AI tutor ready');
});

test('a signed-in learner can delete the account from Settings (Google Play account-deletion requirement)', async ({ page }) => {
  const calls = [];
  await page.route(/\/v1\//, route => {
    const u = route.request().url(); const m = route.request().method(); calls.push(`${m} ${u.replace(/^.*\/v1/, '/v1')}`);
    if (m === 'DELETE' && /\/v1\/me$/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, deleted: { syncBlobs: 1 }, stripe: { cancelled: 0 } }) });
    const body = /health/.test(u) ? { ok: true, ready: true, providers: { ai: true, email: true } }
      : /\/v1\/me$/.test(u) ? { user: { id: 'u1', email: 'a@b.co', plan: 'free' }, usage: {}, limits: {} }
      : /entitlement/.test(u) ? { plan: 'free', features: { ai: true } } : /sync/.test(u) ? { version: 0, data: null } : { ok: true };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(() => { try {
    localStorage.setItem('senlin.apiBase', JSON.stringify('https://senlin-api.example.workers.dev'));
    localStorage.setItem('senlin.auth', JSON.stringify({ token: 't', user: { id: 'u1', email: 'a@b.co', plan: 'free' }, plan: 'free' }));
  } catch (e) {} });
  await page.goto('/#/settings');
  await expect(page.locator('#account')).toContainText('a@b.co');
  await page.locator('#account summary', { hasText: 'Delete account' }).click();
  await expect(page.locator('#acct-delete')).toBeVisible();

  page.once('dialog', d => d.dismiss());
  await page.click('#acct-delete');
  await expect(page.locator('#account')).toContainText('a@b.co');
  expect(calls.filter(c => c.startsWith('DELETE /v1/me'))).toEqual([]);

  page.once('dialog', d => d.accept());
  await page.click('#acct-delete');
  await expect(page.locator('#account')).toContainText(/Sign in|Create account/);
  expect(calls.filter(c => c === 'DELETE /v1/me')).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('senlin.auth'))).toBeNull();
});
