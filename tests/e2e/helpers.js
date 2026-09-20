// Shared helpers for the e2e specs.
'use strict';
const { expect } = require('@playwright/test');

// The nine routes in the header nav, in order: [hash, data-route]
const NAV = [
  ['#/', 'today'], ['#/talk', 'talk'], ['#/levels', 'levels'], ['#/business', 'business'], ['#/library', 'library'],
  ['#/cast', 'cast'], ['#/progress', 'progress'], ['#/method', 'method'], ['#/settings', 'settings']
];

// Network failures we tolerate: the sandbox / CI runner may block Google Fonts and the jsdelivr CDN.
const ALLOWED = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|hanziwriter|ERR_CERT_AUTHORITY_INVALID|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_TUNNEL|ERR_PROXY|ERR_TIMED_OUT|ERR_BLOCKED_BY|Failed to load resource/;

// Collects console errors and uncaught exceptions; `errors()` returns those that are not just blocked CDN loads.
function watchErrors(page) {
  const all = [];
  page.on('console', msg => { if (msg.type() === 'error') all.push({ kind: 'console', text: msg.text(), url: (msg.location() || {}).url || '' }); });
  page.on('pageerror', err => all.push({ kind: 'pageerror', text: String(err && err.message || err), url: '' }));
  return {
    all,
    errors: () => all.filter(e => !(ALLOWED.test(e.text) || ALLOWED.test(e.url)))
  };
}

// Navigates to a hash route and waits for the SPA to render something into #app.
// The suite runs against the static site alone: the per-device server override is set to "" so
// js/config.js disconnects any apiBase baked into the build (no network calls to the worker).
async function go(page, hash) {
  if (!page.__senlinNoApi) { page.__senlinNoApi = true; await page.addInitScript(() => { try { localStorage.setItem('senlin.apiBase', '""'); } catch (e) { /* ignore */ } }); }
  await page.goto('/' + (hash.startsWith('#') ? hash : '#' + hash));
  await page.waitForFunction(() => { const a = document.querySelector('#app'); return a && a.children.length > 0 && a.innerText.trim().length > 0; });
  await expect(page.locator('#app')).toBeVisible();
}

module.exports = { NAV, ALLOWED, watchErrors, go };
