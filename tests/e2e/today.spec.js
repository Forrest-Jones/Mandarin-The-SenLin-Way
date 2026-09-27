'use strict';
const { test, expect } = require('@playwright/test');
const { go, watchErrors } = require('./helpers');

const isoDaysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test.describe('today', () => {
  test('a first visit opens on Day 1 with nothing missed', async ({ page }) => {
    const w = watchErrors(page);
    await go(page, '#/');
    await expect(page.locator('#app')).toContainText(/Day 1\b/);
    await expect(page.locator('#app')).not.toContainText(/Catch-up/);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('senlin.settings') || '{}'));
    expect(stored.startDate).toBe(isoDaysAgo(0));
    expect(w.errors()).toEqual([]);
  });

  test('a learner who fell behind sees the oldest missed day first and can restart the calendar from today', async ({ page }) => {
    await page.addInitScript((start) => {
      localStorage.setItem('senlin.settings', JSON.stringify({ startDate: start }));
      localStorage.setItem('senlin.progress', JSON.stringify({ completed: { 1: start, 2: start, 3: start } }));
    }, isoDaysAgo(9));
    await go(page, '#/');
    const app = page.locator('#app');
    await expect(app).toContainText(/Day 10 · next up: Day 4/);
    await expect(app).toContainText(/Catch-up \(6 missed\)/);
    await expect(app.locator('a.btn-gold')).toHaveAttribute('href', '#/lesson/4');

    await page.click('#reschedule');
    await expect(app).toContainText(/Day 4\b/);
    await expect(app).not.toContainText(/Catch-up/);
    await expect(app.locator('a.btn-gold')).toHaveAttribute('href', '#/lesson/4');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('senlin.settings') || '{}'));
    expect(stored.startDate).toBe(isoDaysAgo(3));
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('senlin.progress') || '{}'));
    expect(Object.keys(progress.completed)).toEqual(['1', '2', '3']);
  });

  test('one or two missed days get the catch-up chips but no restart button', async ({ page }) => {
    await page.addInitScript((start) => {
      localStorage.setItem('senlin.settings', JSON.stringify({ startDate: start }));
      localStorage.setItem('senlin.progress', JSON.stringify({ completed: { 1: start } }));
    }, isoDaysAgo(2));
    await go(page, '#/');
    await expect(page.locator('#app')).toContainText(/Catch-up \(1 missed\)/);
    await expect(page.locator('#reschedule')).toHaveCount(0);
  });
});
