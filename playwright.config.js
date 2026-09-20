// Playwright end-to-end configuration.  Run: npm run e2e  (npx playwright test)
// Serves the static site with python3's http.server and runs every spec on desktop Chromium and
// on a Pixel 7 emulation.  Reuses a server already listening on :8080 when there is one.
'use strict';
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PORT || 8080);
const BASE = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  outputDir: path.join(__dirname, 'test-results'),
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    timezoneId: 'Europe/London'
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `${BASE}/index.html`,
    cwd: __dirname,
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ]
});
