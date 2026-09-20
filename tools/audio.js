#!/usr/bin/env node
/* Licensed pre-generated audio pipeline.
   Enumerates every utterance the site can speak, synthesises each one with a
   commercial TTS voice (Azure or Google) and stores the result as
   audio/<id>.mp3 (+ audio/<id>-slow.mp3 for sentences) with audio/index.json.

   Run:  node tools/audio.js [--provider azure|google] [--levels 1,2,3]
                             [--kinds chars,words,sentences,grammar,scenarios,business,pinyin,ui]
                             [--limit N] [--dry-run] [--force] [--out audio]
   Env:  AZURE_TTS_KEY, AZURE_TTS_REGION, AZURE_TTS_VOICE (default zh-CN-XiaoxiaoNeural)
         GOOGLE_TTS_KEY, GOOGLE_TTS_VOICE (default cmn-CN-Wavenet-A)
   Node 22, built-ins only.  See audio/README.md for licensing and the client lookup rule. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const LEVELS = require('../js/data/levels.js');
const BUSINESS = require('../js/data/business.js');
const SCENARIOS = require('../js/data/scenarios.js');
const PINYIN = require('../js/data/pinyin.js');
const GRAMMAR = require('../js/data/grammar.js');

const ALL_KINDS = ['chars', 'words', 'sentences', 'grammar', 'scenarios', 'business', 'pinyin', 'ui'];
/* Fixed strings spoken by the UI itself (Settings → test voice). */
const UI_STRINGS = ['你好，我是森林。'];
const SLOW_RATE = 0.7;
const VOICES = { azure: 'zh-CN-XiaoxiaoNeural', google: 'cmn-CN-Wavenet-A' };
const PRICE_PER_M = { azure: 16, google: 16 };   /* USD per 1M characters, neural / WaveNet */

/* ------------------------------------------------------------------ ids */
/** Stable id for a spoken text: first 16 hex chars of sha256(exact text, utf8). */
function hashId(text) { return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, 16); }

/* ------------------------------------------------------------ enumerate */
/** Text the site passes to tts.speak() for a pronunciation drill line. Mirrors js/app.js. */
function drillText(d) { return d.replace(/\(.*\)|[→]/g, ''); }

/** Every utterance the site speaks, deduplicated by id.
    Returns [{ id, t, kind, level, slow }]; slow=true means a <id>-slow.mp3 is wanted too. */
function enumerate(opts = {}) {
  const levels = new Set(opts.levels && opts.levels.length ? opts.levels : LEVELS.map(l => l.level));
  const kinds = new Set(opts.kinds && opts.kinds.length ? opts.kinds : ALL_KINDS);
  const out = [], byId = new Map();
  const add = (t, kind, level, slow) => {
    if (typeof t !== 'string') return; t = t.trim(); if (!t) return;
    const id = hashId(t);
    const prev = byId.get(id);
    if (prev) { prev.slow = prev.slow || !!slow; return; }
    const item = { id, t, kind, level: level == null ? null : level, slow: !!slow };
    byId.set(id, item); out.push(item);
  };
  for (const L of LEVELS) {
    if (!levels.has(L.level)) continue;
    if (kinds.has('chars')) L.characters.forEach(c => add(c.h, 'chars', L.level, false));
    if (kinds.has('words')) L.words.forEach(w => add(w.w, 'words', L.level, false));
    if (kinds.has('sentences')) L.sentences.forEach(s => add(s.zh, 'sentences', L.level, true));
    if (kinds.has('grammar')) GRAMMAR.filter(g => g.level === L.level).forEach(g => add(g.zh, 'grammar', L.level, true));
    if (kinds.has('scenarios')) SCENARIOS.filter(s => s.opener && s.track !== 'business' && (s.minLevel || 1) === L.level).forEach(s => add(s.opener.zh, 'scenarios', L.level, true));
  }
  if (kinds.has('business')) {
    BUSINESS.units.forEach(u => {
      (u.terms || []).forEach(t => add(t.w, 'business', 'biz', false));
      (u.phrases || []).forEach(p => add(p.zh, 'business', 'biz', true));
    });
    (BUSINESS.dialogues || []).forEach(d => (d.lines || []).forEach(l => add(l.zh, 'business', 'biz', true)));
    /* deal-room role-plays in Talk (scenarios tagged track: 'business') */
    SCENARIOS.filter(s => s.opener && s.track === 'business').forEach(s => add(s.opener.zh, 'business', 'biz', true));
  }
  if (kinds.has('pinyin')) {
    PINYIN.tonePairs.forEach(tp => add(tp.ex.split(' ')[0], 'pinyin', 0, false));
    PINYIN.initials.forEach(i => add((i.ex || '').split(' ')[1], 'pinyin', 0, false));
    PINYIN.finals.forEach(f => add((f.ex || '').split(' ')[1], 'pinyin', 0, false));
    PINYIN.pronunciationDays.forEach(d => (d.drills || []).forEach(dr => add(drillText(dr), 'pinyin', 0, false)));
  }
  if (kinds.has('ui')) UI_STRINGS.forEach(t => add(t, 'ui', null, false));
  return out;
}

/* -------------------------------------------------------------- summary */
const chars = t => Array.from(t).length;
/** Azure bills every character inside <voice>, markup included, but not the <speak>/<voice> wrapper itself;
    so a slow request costs the text plus its <prosody> tags. */
function ssmlOverhead(rate) { return rate && rate !== 1 ? chars(prosody('', rate)) : 0; }

/** Counts per kind, characters and cost estimates (no network). */
function summarize(items, opts = {}) {
  const voice = opts.voice || VOICES.azure;
  const kinds = {};
  let requests = 0, textChars = 0, azureChars = 0;
  const normOverhead = ssmlOverhead(1), slowOverhead = ssmlOverhead(SLOW_RATE);
  for (const it of items) {
    const k = kinds[it.kind] || (kinds[it.kind] = { items: 0, slow: 0, chars: 0 });
    const n = chars(it.t);
    k.items++; k.chars += n; requests++; textChars += n; azureChars += n + normOverhead;
    if (it.slow) { k.slow++; k.chars += n; requests++; textChars += n; azureChars += n + slowOverhead; }
  }
  return {
    items: items.length, requests, textChars, azureChars, kinds,
    cost: { azure: azureChars / 1e6 * PRICE_PER_M.azure, google: textChars / 1e6 * PRICE_PER_M.google }
  };
}

/* ------------------------------------------------------------ providers */
function escapeXml(s) { return s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])); }
function prosody(text, rate) { return `<prosody rate="${rate}">${escapeXml(text)}</prosody>`; }
function ssml(text, voice, rate) {
  const body = rate && rate !== 1 ? prosody(text, rate) : escapeXml(text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${voice}">${body}</voice></speak>`;
}

const providers = {
  azure: {
    name: 'azure',
    voice: () => process.env.AZURE_TTS_VOICE || VOICES.azure,
    check() { if (!process.env.AZURE_TTS_KEY || !process.env.AZURE_TTS_REGION) throw new Error('Set AZURE_TTS_KEY and AZURE_TTS_REGION (e.g. eastasia)'); },
    async synth(text, rate, voice) {
      const url = `https://${process.env.AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': process.env.AZURE_TTS_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'senlin-audio/1.0'
        },
        body: ssml(text, voice, rate)
      });
      if (!res.ok) throw httpError(res, await safeText(res));
      return Buffer.from(await res.arrayBuffer());
    }
  },
  google: {
    name: 'google',
    voice: () => process.env.GOOGLE_TTS_VOICE || VOICES.google,
    check() { if (!process.env.GOOGLE_TTS_KEY) throw new Error('Set GOOGLE_TTS_KEY (an API key with the Text-to-Speech API enabled)'); },
    async synth(text, rate, voice) {
      const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(process.env.GOOGLE_TTS_KEY)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: voice.split('-').slice(0, 2).join('-'), name: voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: rate || 1 }
        })
      });
      if (!res.ok) throw httpError(res, await safeText(res));
      const j = await res.json();
      if (!j.audioContent) throw new Error('Google TTS returned no audioContent');
      return Buffer.from(j.audioContent, 'base64');
    }
  }
};
async function safeText(res) { try { return (await res.text()).slice(0, 300); } catch (e) { return ''; } }
function httpError(res, body) { const e = new Error(`HTTP ${res.status} ${res.statusText} ${body}`.trim()); e.status = res.status; e.retryAfter = Number(res.headers.get('retry-after')) || 0; return e; }

/** Retries on 429 / 5xx / network errors with exponential backoff and jitter. */
async function withRetry(fn, { attempts = 6, base = 800 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const retriable = !e.status || e.status === 429 || e.status >= 500;
      if (!retriable || i === attempts - 1) throw e;
      const wait = e.retryAfter ? e.retryAfter * 1000 : Math.min(30000, base * 2 ** i) * (0.7 + Math.random() * 0.6);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw last;
}

/* ----------------------------------------------------------- mp3 length */
/** Duration in ms of an MP3 buffer by walking its frames (Layer III, CBR or VBR). undefined if unparseable. */
function mp3Duration(buf) {
  let pos = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') pos = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  const BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let samples = 0, rate = 0, frames = 0;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) { pos++; continue; }
    const h = buf.readUInt32BE(pos);
    const ver = (h >> 19) & 3, layer = (h >> 17) & 3, bri = (h >> 12) & 15, sri = (h >> 10) & 3, pad = (h >> 9) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { pos++; continue; }
    const mpeg1 = ver === 3, br = BR[mpeg1 ? 1 : 2][bri] * 1000, sr = SR[ver][sri];
    const len = Math.floor((mpeg1 ? 144 : 72) * br / sr) + pad;
    if (len < 4) { pos++; continue; }
    samples += mpeg1 ? 1152 : 576; rate = sr; frames++; pos += len;
  }
  return frames && rate ? Math.round(samples / rate * 1000) : undefined;
}

/* ------------------------------------------------------------------ cli */
function parseArgs(argv) {
  const a = { provider: 'azure', levels: [], kinds: [], limit: 0, dryRun: false, force: false, out: 'audio', concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--provider') { a.provider = v; i++; }
    else if (k === '--levels') { a.levels = v.split(',').map(Number).filter(n => n > 0); i++; }
    else if (k === '--kinds') { a.kinds = v.split(',').map(s => s.trim()).filter(Boolean); i++; }
    else if (k === '--limit') { a.limit = Number(v) || 0; i++; }
    else if (k === '--out') { a.out = v; i++; }
    else if (k === '--concurrency') { a.concurrency = Math.max(1, Number(v) || 4); i++; }
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--force') a.force = true;
    else if (k === '--help' || k === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(0); }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!providers[a.provider]) throw new Error(`unknown provider ${a.provider} (azure|google)`);
  a.kinds.forEach(k => { if (!ALL_KINDS.includes(k)) throw new Error(`unknown kind ${k} (${ALL_KINDS.join(',')})`); });
  return a;
}

function readIndex(file, provider, voice) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && j.items) return j; } catch (e) { /* fresh */ }
  return { version: 1, provider, voice, items: {} };
}
function writeIndex(file, index) {
  const sorted = {}; Object.keys(index.items).sort().forEach(k => { sorted[k] = index.items[k]; });
  index.items = sorted;
  fs.writeFileSync(file, JSON.stringify(index, null, 0) + '\n');
}

function printSummary(sum, provider) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('kind', 11) + pad('items', 8) + pad('slow', 8) + 'chars');
  for (const [k, v] of Object.entries(sum.kinds)) console.log(pad(k, 11) + pad(v.items, 8) + pad(v.slow, 8) + v.chars);
  console.log(`${pad('total', 11)}${pad(sum.items, 8)}${pad(sum.requests - sum.items, 8)}${sum.textChars}  (${sum.requests} requests)`);
  console.log(`estimated cost: Azure neural ≈ $${sum.cost.azure.toFixed(2)} (${sum.azureChars} billable chars incl. <prosody> markup) · Google WaveNet ≈ $${sum.cost.google.toFixed(2)} (${sum.textChars} chars) · at $${PRICE_PER_M.azure}/1M` + (provider ? ` · selected: ${provider}` : ''));
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const P = providers[args.provider];
  const voice = P.voice();
  let items = enumerate({ levels: args.levels, kinds: args.kinds });
  if (args.limit) items = items.slice(0, args.limit);
  if (args.dryRun) {
    console.log(`dry run · provider ${P.name} · voice ${voice} · levels ${args.levels.length ? args.levels.join(',') : 'all'} · kinds ${args.kinds.length ? args.kinds.join(',') : 'all'}`);
    printSummary(summarize(items, { voice }), P.name);
    return;
  }
  P.check();
  const outDir = path.resolve(ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const indexFile = path.join(outDir, 'index.json');
  const index = readIndex(indexFile, P.name, voice);
  if (index.provider !== P.name || index.voice !== voice) console.warn(`warning: index.json was built with ${index.provider}/${index.voice}; new files use ${P.name}/${voice}. Use --force to rebuild everything.`);
  index.provider = P.name; index.voice = voice;

  /* work list: one job per file (normal + slow), skipping what exists unless --force */
  const jobs = [];
  for (const it of items) {
    const f = path.join(outDir, `${it.id}.mp3`);
    if (args.force || !index.items[it.id] || !fs.existsSync(f)) jobs.push({ it, rate: 1, file: f });
    if (it.slow) { const fs2 = path.join(outDir, `${it.id}-slow.mp3`); if (args.force || !fs.existsSync(fs2)) jobs.push({ it, rate: SLOW_RATE, file: fs2 }); }
  }
  const skipped = items.length * 2 - jobs.length;
  console.log(`${P.name} · ${voice} · ${items.length} utterances · ${jobs.length} files to synthesise (${jobs.length ? '' : 'nothing to do, '}${Math.max(0, skipped)} already present)`);
  if (!jobs.length) return;

  let done = 0, failed = 0, sentChars = 0, next = 0, dirty = 0;
  const errors = [];
  const flush = () => { if (dirty) { writeIndex(indexFile, index); dirty = 0; } };
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const buf = await withRetry(() => P.synth(job.it.t, job.rate, voice));
        if (!buf.length) throw new Error('empty audio');
        fs.writeFileSync(job.file, buf);
        sentChars += chars(job.it.t);
        if (job.rate === 1) {
          const entry = { t: job.it.t };
          const d = mp3Duration(buf); if (d) entry.d = d;
          if (job.it.slow) entry.s = 1;
          index.items[job.it.id] = entry;
        } else if (index.items[job.it.id]) index.items[job.it.id].s = 1;
        dirty++;
      } catch (e) { failed++; errors.push(`${job.it.id} "${job.it.t}"${job.rate !== 1 ? ' (slow)' : ''}: ${e.message}`); }
      done++;
      if (done % 50 === 0) { flush(); console.log(`${done}/${jobs.length} · ${failed} failed · ${sentChars} chars`); }
    }
  };
  const stop = () => { flush(); console.log(`\ninterrupted after ${done} files; index.json saved`); process.exit(130); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  await Promise.all(Array.from({ length: Math.min(args.concurrency, jobs.length) }, worker));
  flush();
  const price = PRICE_PER_M[P.name];
  console.log(`done: ${done - failed} files written, ${failed} failed, ${Object.keys(index.items).length} items in index.json`);
  console.log(`characters sent: ${sentChars} ≈ $${(sentChars / 1e6 * price).toFixed(2)} at $${price}/1M (${P.name}${P.name === 'azure' ? '; Azure also bills the <prosody> tags on slow files, so expect slightly more' : ''})`);
  if (errors.length) { console.log('failures (re-run to retry):'); errors.slice(0, 20).forEach(e => console.log('  ' + e)); if (errors.length > 20) console.log(`  … ${errors.length - 20} more`); process.exitCode = 1; }
}

module.exports = { hashId, enumerate, summarize, mp3Duration, ssml, drillText, withRetry, providers, main, ALL_KINDS, UI_STRINGS, SLOW_RATE, VOICES, PRICE_PER_M, LEVELS };

if (require.main === module) main().catch(e => { console.error('error:', e.message); process.exit(1); });
