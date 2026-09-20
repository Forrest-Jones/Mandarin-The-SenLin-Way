'use strict';
/* Accessibility audit with axe-core on the main views.
   Serious and critical violations fail the suite, except the ones listed in KNOWN below: those live in
   markup this suite does not own (index.html / js/app.js) and are reported as warnings so the lead can fix
   them; once they are fixed, the matching KNOWN entry is unused and should be removed. */
const { test, expect } = require('@playwright/test');
const { go } = require('./helpers');

const PAGES = [['#/', 'today'], ['#/levels', 'levels'], ['#/settings', 'settings'], ['#/business', 'business']];

// { rule, selector (regex against the violation's target selector), note }
const KNOWN = [];

let axeSource = null;
try { axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch (e) { axeSource = null; }

async function runAxe(page) {
  if (axeSource) {
    await page.evaluate(src => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s); } }, axeSource);
    const res = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, rules: { 'color-contrast': { enabled: true } } });
      return r.violations.map(v => ({ rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target.join(' '), summary: n.failureSummary })) }));
    });
    return { engine: 'axe-core', violations: res };
  }
  // Lightweight fallback when axe-core is not installed: the checks the lead asked for.
  const res = await page.evaluate(() => {
    const out = [];
    const push = (rule, el, help) => out.push({ rule, impact: 'serious', help, nodes: [{ target: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), summary: help }] });
    const name = el => (el.getAttribute('aria-label') || el.getAttribute('title') || (el.innerText || '').trim() || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby')) || {}).innerText || (el.querySelector('img[alt]') || {}).alt || '').trim();
    document.querySelectorAll('img').forEach(i => { if (!i.hasAttribute('alt')) push('image-alt', i, 'img has no alt'); });
    document.querySelectorAll('button, a[href]').forEach(b => { if (!name(b)) push(b.tagName === 'A' ? 'link-name' : 'button-name', b, 'no accessible name'); });
    const h1 = document.querySelectorAll('h1'); if (h1.length !== 1) out.push({ rule: 'page-has-heading-one', impact: 'moderate', help: `${h1.length} h1 elements`, nodes: [{ target: 'h1', summary: '' }] });
    document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(i => {
      const ok = i.id && document.querySelector(`label[for="${i.id}"]`) || i.closest('label') || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.getAttribute('title') || i.getAttribute('placeholder');
      if (!ok) push('label', i, 'form control has no label');
    });
    return out;
  });
  return { engine: 'lightweight', violations: res };
}

test.describe('accessibility', () => {
  for (const [hash, name] of PAGES) {
    test(`${name}: no serious or critical axe violations`, async ({ page }, testInfo) => {
      await go(page, hash);
      const { engine, violations } = await runAxe(page);
      const isKnown = (v, n) => KNOWN.some(k => k.rule === v.rule && k.selector.test(n.target));
      const failing = [], warnings = [];
      for (const v of violations) {
        for (const n of v.nodes) {
          const line = `[${v.impact}] ${v.rule} — ${v.help}\n    ${n.target}`;
          if (v.impact === 'serious' || v.impact === 'critical') (isKnown(v, n) ? warnings : failing).push(line);
          else warnings.push(line + '   (minor/moderate, not failing)');
        }
      }
      if (warnings.length) {
        const known = warnings.filter(w => !/not failing/.test(w));
        const msg = `A11Y WARNING (${engine}) on ${hash}${known.length ? ' — ' + known.length + ' known serious issue(s) in existing markup, NOT failing the suite' : ''}:\n  ` + warnings.join('\n  ');
        console.warn(msg);
        testInfo.annotations.push({ type: 'a11y-warning', description: msg });
      }
      expect(failing, `${engine} found serious/critical violations on ${hash}:\n  ` + failing.join('\n  ')).toEqual([]);
    });
  }
});
