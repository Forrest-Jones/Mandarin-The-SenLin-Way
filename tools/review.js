#!/usr/bin/env node
/* Native-review workflow for the curriculum text (HSK 4–6 by default).
   Export:  node tools/review.js [--levels 4,5,6] [--kinds sentences,grammar,business] [--format csv|md] [--out review/]
            → review/hsk4.csv … (+ review/business.csv when kinds include business)
   Apply:   node tools/review.js --apply review/hsk4-reviewed.csv [--out review/]
            reads the reviewed CSV back (status ok|fix|drop, note "zh|pinyin|en" for fixes),
            prints a patch summary and writes review/hsk4.patch.json.  Data files are never edited here.
   Ids are the same sha256-16 hashes tools/audio.js uses, so a row maps to its audio file.   */
'use strict';
const fs = require('fs');
const path = require('path');
const { hashId } = require('./audio.js');

const ROOT = path.resolve(__dirname, '..');
const LEVELS = require('../js/data/levels.js');
const GRAMMAR = require('../js/data/grammar.js');
const SCENARIOS = require('../js/data/scenarios.js');
const BUSINESS = require('../js/data/business.js');

const COLUMNS = ['id', 'level', 'kind', 'zh', 'pinyin', 'en', 'status', 'reviewer', 'note'];
const ALL_KINDS = ['sentences', 'grammar', 'business'];
const STATUSES = ['ok', 'fix', 'drop'];

/* -------------------------------------------------------------- collect */
/** Rows for review: [{ id, level, kind, zh, pinyin, en, file, path }]. level is a number or 'biz'. */
function collect(opts = {}) {
  const levels = new Set(opts.levels && opts.levels.length ? opts.levels : [4, 5, 6]);
  const kinds = new Set(opts.kinds && opts.kinds.length ? opts.kinds : ALL_KINDS);
  const rows = [];
  const row = (level, kind, zh, pinyin, en, file, p) => rows.push({ id: hashId(zh.trim()), level, kind, zh, pinyin: pinyin || '', en: en || '', file, path: p });
  for (const L of LEVELS) {
    if (!levels.has(L.level)) continue;
    const file = `js/data/hsk${L.level}.js`;
    if (kinds.has('sentences')) {
      L.sentences.forEach((s, i) => row(L.level, 'sentence', s.zh, s.p, s.en, file, `sentences[${i}]`));
      SCENARIOS.forEach((s, i) => { if (s.opener && s.track !== 'business' && (s.minLevel || 1) === L.level) row(L.level, 'scenario', s.opener.zh, s.opener.p, s.opener.en, 'js/data/scenarios.js', `[${i}].opener`); });
    }
    if (kinds.has('grammar')) GRAMMAR.forEach((g, i) => { if (g.level === L.level) row(L.level, 'grammar', g.zh, g.p, g.en, 'js/data/grammar.js', `[${i}]`); });
  }
  if (kinds.has('business')) {
    BUSINESS.units.forEach((u, ui) => {
      (u.terms || []).forEach((t, i) => row('biz', 'business-term', t.w, t.p, t.m, 'js/data/business.js', `units[${ui}].terms[${i}]`));
      (u.phrases || []).forEach((p, i) => row('biz', 'business-phrase', p.zh, p.p, p.en, 'js/data/business.js', `units[${ui}].phrases[${i}]`));
    });
    (BUSINESS.dialogues || []).forEach((d, di) => (d.lines || []).forEach((l, i) => row('biz', 'business-dialogue', l.zh, l.p, l.en, 'js/data/business.js', `dialogues[${di}].lines[${i}]`)));
    SCENARIOS.forEach((s, i) => { if (s.opener && s.track === 'business') row('biz', 'scenario', s.opener.zh, s.opener.p, s.opener.en, 'js/data/scenarios.js', `[${i}].opener`); });
  }
  return rows;
}

/* ------------------------------------------------------------------ csv */
function csvField(v) { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function toCSV(rows, columns = COLUMNS) {
  return '﻿' + [columns.join(','), ...rows.map(r => columns.map(c => csvField(r[c])).join(','))].join('\n') + '\n';
}
/** RFC 4180-ish parser: quoted fields, doubled quotes, newlines inside quotes, CRLF, optional BOM. */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = []; let rec = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { rec.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; rec.push(field); records.push(rec); rec = []; field = ''; }
    else field += c;
  }
  if (field !== '' || rec.length) { rec.push(field); records.push(rec); }
  const nonEmpty = records.filter(r => r.some(f => f.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map(h => h.trim().toLowerCase());
  return nonEmpty.slice(1).map(r => { const o = {}; header.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; });
}
function toMarkdown(rows, title) {
  const esc = v => String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return `# ${title}\n\nFill in **status** (ok / fix / drop), **reviewer** and **note** (for fixes: \`zh|pinyin|en\`, leave a part empty to keep it).\n\n| ${COLUMNS.join(' | ')} |\n|${COLUMNS.map(() => '---').join('|')}|\n` +
    rows.map(r => `| ${COLUMNS.map(c => esc(r[c])).join(' | ')} |`).join('\n') + '\n';
}

/* --------------------------------------------------------------- export */
function exportReview(args) {
  const outDir = path.resolve(ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const rows = collect({ levels: args.levels, kinds: args.kinds });
  const groups = new Map();
  rows.forEach(r => { const k = r.level === 'biz' ? 'business' : `hsk${r.level}`; (groups.get(k) || groups.set(k, []).get(k)).push(r); });
  const written = [];
  for (const [name, rs] of groups) {
    const file = path.join(outDir, `${name}.${args.format}`);
    const body = args.format === 'md' ? toMarkdown(rs, `Content review · ${name.toUpperCase()}`) : toCSV(rs.map(r => ({ ...r, status: '', reviewer: '', note: '' })));
    fs.writeFileSync(file, body);
    written.push({ file, rows: rs.length, bytes: Buffer.byteLength(body) });
  }
  written.forEach(w => console.log(`${path.relative(ROOT, w.file)}  ${w.rows} rows  ${(w.bytes / 1024).toFixed(0)} KB`));
  console.log(`${rows.length} rows in ${written.length} file(s). Send them to a native Mandarin editor with review/README.md; get back <name>-reviewed.csv and run --apply.`);
  return written;
}

/* ---------------------------------------------------------------- apply */
/** Turns a reviewed CSV (parsed rows) into a patch object, resolving ids against the current data. */
function buildPatch(reviewed, source) {
  const current = new Map(collect({ levels: [1, 2, 3, 4, 5, 6], kinds: ALL_KINDS }).map(r => [r.id, r]));
  const summary = { rows: reviewed.length, ok: 0, fix: 0, drop: 0, blank: 0, unknownStatus: 0, unknownId: 0, fixWithoutCorrection: 0, unchanged: 0 };
  const changes = [], problems = [];
  for (const r of reviewed) {
    const status = (r.status || '').toLowerCase();
    if (!status) { summary.blank++; continue; }
    if (!STATUSES.includes(status)) { summary.unknownStatus++; problems.push(`${r.id || '?'}: unknown status "${r.status}" (use ok, fix or drop)`); continue; }
    if (status === 'ok') { summary.ok++; continue; }
    const id = r.id || (r.zh ? hashId(r.zh.trim()) : '');
    const cur = current.get(id) || (r.zh && current.get(hashId(r.zh.trim())));
    if (!cur) { summary.unknownId++; problems.push(`${id || '?'}: not found in the current data (was it already changed?) — "${r.zh || ''}"`); continue; }
    const from = { zh: cur.zh, p: cur.pinyin, en: cur.en };
    const base = { id: cur.id, action: status, level: cur.level, kind: cur.kind, file: cur.file, path: cur.path, from, reviewer: r.reviewer || '', note: r.note || '' };
    if (status === 'drop') { summary.drop++; changes.push(base); continue; }
    /* fix: note = "zh|pinyin|en" (empty part = keep) */
    const parts = (r.note || '').includes('|') ? r.note.split('|').map(s => s.trim()) : null;
    if (!parts) { summary.fixWithoutCorrection++; problems.push(`${cur.id}: status fix but note has no "zh|pinyin|en" correction — "${r.note || ''}"`); changes.push({ ...base, action: 'fix', to: null, needsAttention: true }); continue; }
    const to = { zh: parts[0] || from.zh, p: parts[1] || from.p, en: parts[2] || from.en };
    if (to.zh === from.zh && to.p === from.p && to.en === from.en) { summary.unchanged++; problems.push(`${cur.id}: fix with no actual change`); continue; }
    summary.fix++;
    changes.push({ ...base, to, newId: to.zh !== from.zh ? hashId(to.zh) : cur.id, comment: parts.slice(3).join('|') });
  }
  return { version: 1, source, generated: new Date().toISOString(), summary, changes, problems };
}

function applyReview(args) {
  const src = path.resolve(ROOT, args.apply);
  const reviewed = parseCSV(fs.readFileSync(src, 'utf8'));
  const patch = buildPatch(reviewed, path.relative(ROOT, src));
  const base = path.basename(src).replace(/\.csv$/i, '').replace(/-reviewed$/i, '');
  const outDir = path.resolve(ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${base}.patch.json`);
  fs.writeFileSync(outFile, JSON.stringify(patch, null, 2) + '\n');
  const s = patch.summary;
  console.log(`${path.relative(ROOT, src)}: ${s.rows} rows · ${s.ok} ok · ${s.fix} fix · ${s.drop} drop · ${s.blank} not reviewed`);
  patch.changes.forEach(c => {
    if (c.action === 'drop') console.log(`  DROP ${c.id} ${c.file} ${c.path}  "${c.from.zh}"`);
    else if (c.to) console.log(`  FIX  ${c.id} ${c.file} ${c.path}\n       - ${c.from.zh} | ${c.from.p} | ${c.from.en}\n       + ${c.to.zh} | ${c.to.p} | ${c.to.en}`);
    else console.log(`  FIX? ${c.id} ${c.file} ${c.path}  (no correction in note: "${c.note}")`);
  });
  if (patch.problems.length) { console.log(`${patch.problems.length} problem(s):`); patch.problems.forEach(p => console.log('  ' + p)); }
  console.log(`patch written to ${path.relative(ROOT, outFile)} (${patch.changes.length} change(s)). Data files were not modified.`);
  return patch;
}

/* ------------------------------------------------------------------ cli */
function parseArgs(argv) {
  const a = { levels: [], kinds: [], format: 'csv', out: 'review', apply: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--levels') { a.levels = v.split(',').map(Number).filter(n => n > 0); i++; }
    else if (k === '--kinds') { a.kinds = v.split(',').map(s => s.trim()).filter(Boolean); i++; }
    else if (k === '--format') { a.format = v; i++; }
    else if (k === '--out') { a.out = v; i++; }
    else if (k === '--apply') { a.apply = v; i++; }
    else if (k === '--help' || k === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 8).join('\n')); process.exit(0); }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!['csv', 'md'].includes(a.format)) throw new Error('--format must be csv or md');
  a.kinds.forEach(k => { if (!ALL_KINDS.includes(k)) throw new Error(`unknown kind ${k} (${ALL_KINDS.join(',')})`); });
  return a;
}
function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  return args.apply ? applyReview(args) : exportReview(args);
}

module.exports = { collect, toCSV, parseCSV, toMarkdown, buildPatch, exportReview, applyReview, main, COLUMNS, ALL_KINDS, STATUSES };

if (require.main === module) { try { main(); } catch (e) { console.error('error:', e.message); process.exit(1); } }
