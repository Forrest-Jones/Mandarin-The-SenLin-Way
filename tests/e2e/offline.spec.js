'use strict';
const { test, expect } = require('@playwright/test');
const { go } = require('./helpers');

test.describe('offline', () => {
  test('registers the service worker and caches the app shell', async ({ page }) => {
    await go(page, '#/');
    const reg = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const r = await Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(() => res(null), 10000))]);
      const list = await navigator.serviceWorker.getRegistrations();
      return { supported: true, ready: !!r, scope: r && r.scope, count: list.length, script: r && (r.active || r.installing || r.waiting) && (r.active || r.installing || r.waiting).scriptURL };
    });
    expect(reg.supported).toBe(true);
    expect(reg.count).toBeGreaterThanOrEqual(1);
    expect(reg.ready).toBe(true);
    expect(reg.script).toMatch(/\/sw\.js$/);

    // the shell lands in the Cache Storage
    const cached = await page.evaluate(async () => {
      for (let i = 0; i < 40; i++) {
        const keys = await caches.keys();
        for (const k of keys) { const c = await caches.open(k); const hit = await c.match('./index.html') || await c.match('/index.html'); if (hit) return { key: k, ok: true }; }
        await new Promise(r => setTimeout(r, 250));
      }
      return { ok: false, keys: await caches.keys() };
    });
    expect(cached.ok, 'index.html not cached: ' + JSON.stringify(cached)).toBe(true);

    // manifest is wired up
    const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifest).toBeTruthy();
    const res = await page.request.get('/' + manifest);
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.name).toBe('Mandarin The SenLin Way');
    expect(Array.isArray(json.icons) && json.icons.length).toBeTruthy();
  });
});
