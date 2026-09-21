#!/usr/bin/env node
/* Applies review patches (review/<name>.patch.json, written by tools/review.js --apply) to the data files.
     node tools/apply-review.js                      # every review/*.patch.json, dry run (prints what would change)
     node tools/apply-review.js --write              # edit js/data/*.js in place
     node tools/apply-review.js --write review/hsk4.patch.json
   Every data entry lives on one line ({zh: "…", p: "…", en: "…"} or { w: '…', p: '…', m: '…', … }), so a change is
   a line rewrite: the entry is found by its current text, its zh / pinyin / English values are swapped, and a
   "drop" removes the line (sentences only; a dropped grammar point, scenario or Deal Desk line is flagged for a
   human instead, because other content refers to it).  Run node tools/validate.js afterwards.                  */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const files = args.filter(a => !a.startsWith('--'));
const patches = files.length ? files : fs.readdirSync(path.join(ROOT, 'review')).filter(f => f.endsWith('.patch.json')).map(f => `review/${f}`);

/** Keys that hold the three reviewed strings, per kind. */
const KEYS = { 'business-term': ['w', 'p', 'm'] };
const keysFor = kind => KEYS[kind] || ['zh', 'p', 'en'];

/** Finds `key: 'value'` / `key: "value"` on a line; returns { start, end, quote } of the value or null. */
function findValue(line, key) {
  const re = new RegExp(`(^|[\\s{,])${key}:\\s*(['"])`, 'g');
  let m;
  while ((m = re.exec(line))) {
    const quote = m[2]; let i = re.lastIndex; let s = '';
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === '\\') { s += line[++i]; continue; }
      if (c === quote) return { start: re.lastIndex, end: i, quote, value: s };
      s += c;
    }
  }
  return null;
}
function quoteFor(value, quote) {
  const body = value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote);
  return body;
}
function rewrite(line, key, value) {
  const v = findValue(line, key);
  if (!v) return null;
  return line.slice(0, v.start) + quoteFor(value, v.quote) + line.slice(v.end);
}

const report = { fixed: 0, dropped: 0, skipped: [], files: new Set() };
const sources = new Map();
const load = f => { if (!sources.has(f)) sources.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')); return sources.get(f); };

for (const pf of patches) {
  const patch = JSON.parse(fs.readFileSync(path.resolve(ROOT, pf), 'utf8'));
  for (const c of patch.changes || []) {
    const [kz, kp, ke] = keysFor(c.kind);
    const lines = load(c.file);
    const hits = lines.map((l, i) => ({ l, i })).filter(({ l }) => { const v = findValue(l, kz); return v && v.value === c.from.zh; });
    if (hits.length !== 1) { report.skipped.push(`${c.id} ${c.file}: ${hits.length ? 'several lines' : 'no line'} match "${c.from.zh}"`); continue; }
    const { i } = hits[0];
    if (c.action === 'drop') {
      if (c.kind !== 'sentence') { report.skipped.push(`${c.id} ${c.file} ${c.path}: drop of a ${c.kind} needs a human ("${c.note}")`); continue; }
      console.log(`DROP ${c.file}:${i + 1}  ${c.from.zh}  — ${c.note}`);
      lines.splice(i, 1); report.dropped++; report.files.add(c.file); continue;
    }
    if (!c.to) { report.skipped.push(`${c.id} ${c.file}: fix without a correction ("${c.note}")`); continue; }
    let line = lines[i]; let bad = null;
    for (const [k, val] of [[kz, c.to.zh], [kp, c.to.p], [ke, c.to.en]]) {
      if (val == null) continue;
      const r = rewrite(line, k, val);
      if (r == null) { bad = k; break; }
      line = r;
    }
    if (bad) { report.skipped.push(`${c.id} ${c.file}:${i + 1}: no ${bad}: value on the line`); continue; }
    if (line === lines[i]) continue;
    console.log(`FIX  ${c.file}:${i + 1}\n     - ${c.from.zh} | ${c.from.p} | ${c.from.en}\n     + ${c.to.zh} | ${c.to.p} | ${c.to.en}${c.comment ? `\n     · ${c.comment}` : ''}`);
    lines[i] = line; report.fixed++; report.files.add(c.file);
  }
}

if (WRITE) for (const f of report.files) fs.writeFileSync(path.join(ROOT, f), sources.get(f).join('\n'));
console.log(`\n${report.fixed} fix(es), ${report.dropped} drop(s) in ${report.files.size} file(s)${WRITE ? ' — written' : ' — dry run (add --write)'}`);
if (report.skipped.length) { console.log(`${report.skipped.length} left for a human:`); report.skipped.forEach(s => console.log('  ' + s)); }
if (report.fixed + report.dropped) console.log('Changed lines with a new zh need fresh audio: node tools/audio.js (see tools/README or audio/README.md).');
