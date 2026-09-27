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

test.describe('pronunciation days', () => {
  test('Day 1 has four segments with content and a five-question tone quiz', async ({ page }) => {
    const errs = watchErrors(page);
    await go(page, '#/lesson/1');
    await expect(page.locator('[data-seg]')).toHaveCount(5);            // four segments + Done
    await expect(page.locator('#segment')).toContainText('Warm-up: tones');
    await page.locator('[data-seg="2"]').click();
    await expect(page.locator('#segment')).toContainText('Say each row three times');
    await expect(page.locator('#segment [data-shadow]')).toHaveCount(3);
    await page.locator('[data-seg="3"]').click();
    await expect(page.locator('#segment')).toContainText('Question 1 of 5');
    await expect(page.locator('#segment .quiz-opt')).toHaveCount(4);
    expect(errs.errors()).toEqual([]);
  });
});

test('a lesson in progress resumes after a reload, Today offers to resume it, and finishing clears it', async ({ page }) => {
  const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 12 * 86400e3));   // the browser's zone, not Node's
  await page.addInitScript((s) => { localStorage.setItem('senlin.settings', JSON.stringify({ startDate: s })); const c = {}; for (let i = 1; i <= 12; i++) c[i] = s; localStorage.setItem('senlin.progress', JSON.stringify({ completed: c })); }, start);
  await go(page, '#/lesson/13');
  await page.click('#next'); await page.click('#next');
  await expect(page.locator('#segments button.active')).toContainText('Sentences');
  await page.reload();
  await go(page, '#/lesson/13');
  await expect(page.locator('#segments button.active')).toContainText('Sentences');
  await expect(page.locator('#segment .eyebrow').first()).toContainText('3 of 4');

  await go(page, '#/');
  await expect(page.locator('a.btn-gold')).toContainText(/Resume Day 13 · step 3/);

  await go(page, '#/lesson/13');
  await page.click('#next');
  for (let k = 0; k < 40; k++) {
    if (await page.locator('#qn').count()) { await page.click('#qn'); continue; }
    const o = page.locator('[data-opt]:not([data-opt="__skip__"])'); if (await o.count()) { await o.first().click(); continue; }
    break;
  }
  await page.click('#next');
  await expect(page.locator('.done-banner')).toContainText('Day 13 complete');
  await expect(page.locator('#share')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('senlin.lesson') || 'null'))).toBeNull();
  await go(page, '#/');
  await expect(page.locator('a.btn-gold')).toContainText(/Day 14|Do it again|Start/);
});

test('from the second lesson the done screen offers to install the app when the browser allows it', async ({ page }) => {
  const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 13 * 86400e3));
  await page.addInitScript((s) => {
    localStorage.setItem('senlin.settings', JSON.stringify({ startDate: s }));
    const c = {}; for (let i = 1; i <= 13; i++) c[i] = s; localStorage.setItem('senlin.progress', JSON.stringify({ completed: c }));
    localStorage.setItem('senlin.nudge-reminder', String(Date.now()));
    window.__installPrompted = 0;
    window.addEventListener('load', () => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__installPrompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  }, start);
  await go(page, '#/lesson/14');
  for (let i = 0; i < 6; i++) {
    for (let k = 0; k < 40; k++) {
      if (await page.locator('#reveal').count()) { await page.click('#reveal'); continue; }
      if (await page.locator('[data-grade="2"]').count()) { await page.click('[data-grade="2"]'); continue; }
      if (await page.locator('#qn').count()) { await page.click('#qn'); continue; }
      const o = page.locator('[data-opt]:not([data-opt="__skip__"])'); if (await o.count()) { await o.first().click(); continue; }
      break;
    }
    const nx = page.locator('#next'); if (await nx.count()) await nx.click(); else break;
  }
  await expect(page.locator('.done-banner')).toContainText('Day 14 complete');
  await expect(page.locator('#nudge-install')).toContainText('Install SenLin');
  await page.click('#nudge-install-go');
  expect(await page.evaluate(() => window.__installPrompted)).toBe(1);
  await expect(page.locator('#nudge-install')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('senlin.nudge-install'))).not.toBeNull();
});
