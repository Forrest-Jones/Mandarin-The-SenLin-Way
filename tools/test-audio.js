#!/usr/bin/env node
/* Audio pipeline and review workflow tests.  Run: node --test tools/test-audio.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const A = require('./audio.js');
const R = require('./review.js');

test('id hashing is stable', () => {
  /* fixed vectors: a change here would orphan every file already generated */
  assert.equal(A.hashId('你好，我是森林。'), 'b71ce285e386d0e0');
  assert.equal(A.hashId('木'), '9213ab05890bafa2');
  assert.equal(A.hashId('木'), crypto.createHash('sha256').update('木', 'utf8').digest('hex').slice(0, 16));
  assert.match(A.hashId('林'), /^[0-9a-f]{16}$/);
  assert.equal(A.hashId('森'), A.hashId('森'));
  assert.notEqual(A.hashId('木'), A.hashId('林'));
  assert.notEqual(A.hashId('你好'), A.hashId('你好。'), 'punctuation is part of the text');
});

test('enumeration has no duplicate ids and no empty texts', () => {
  const items = A.enumerate();
  const ids = new Set(items.map(i => i.id));
  assert.equal(ids.size, items.length);
  items.forEach(i => { assert.ok(i.t.length > 0, `empty text for ${i.id}`); assert.equal(i.t, i.t.trim()); assert.ok(A.ALL_KINDS.includes(i.kind), i.kind); });
});

test('every level\'s characters, words and sentences are included', () => {
  const items = A.enumerate();
  const byText = new Map(items.map(i => [i.t, i]));
  for (const L of A.LEVELS) {
    L.characters.forEach(c => { const it = byText.get(c.h); assert.ok(it, `${c.h} (HSK ${L.level}) missing`); assert.equal(it.kind, 'chars'); assert.equal(it.level, L.level); });
    L.words.forEach(w => assert.ok(byText.has(w.w), `${w.w} missing`));
    L.sentences.forEach(s => { const it = byText.get(s.zh); assert.ok(it, `"${s.zh}" missing`); assert.ok(it.slow, `"${s.zh}" has no slow variant`); });
  }
  A.UI_STRINGS.forEach(t => assert.ok(byText.has(t)));
  const only1 = A.enumerate({ levels: [1], kinds: ['chars'] });
  assert.equal(only1.length, A.LEVELS[0].characters.length);
  assert.ok(only1.every(i => i.kind === 'chars' && i.level === 1));
});

test('business, pinyin and scenario utterances match what the site speaks', () => {
  const items = A.enumerate({ kinds: ['business', 'pinyin', 'scenarios'] });
  const texts = new Set(items.map(i => i.t));
  assert.ok(texts.has('很荣幸认识您，王总。'));
  assert.ok(texts.has('董事长'));
  assert.ok(texts.has('今天'), 'tone-pair example speaks the hanzi only');
  assert.ok(texts.has('八'), 'initial example speaks the hanzi only');
  assert.ok(texts.has(A.drillText('mā má mǎ mà ma')));
  assert.equal(A.drillText('nǐ hǎo → ní hǎo'), 'nǐ hǎo  ní hǎo');
  assert.ok(!Array.from(texts).some(t => /[()→]/.test(t)));
  assert.ok(items.some(i => i.kind === 'business' && i.slow) && items.some(i => i.kind === 'business' && !i.slow));
  assert.ok(items.filter(i => i.kind === 'scenarios').length >= 10);
});

test('dry-run summary returns counts > 0 and a cost', () => {
  const sum = A.summarize(A.enumerate());
  assert.ok(sum.items > 9000, String(sum.items));
  assert.ok(sum.requests > sum.items);
  assert.ok(sum.textChars > 0 && sum.azureChars >= sum.textChars);
  for (const k of A.ALL_KINDS) assert.ok(sum.kinds[k] && sum.kinds[k].items > 0, `kind ${k} empty`);
  assert.ok(sum.kinds.sentences.slow === sum.kinds.sentences.items);
  assert.equal(sum.kinds.chars.slow, 0);
  assert.ok(sum.cost.azure > 0 && sum.cost.azure < 10, `azure $${sum.cost.azure}`);
  assert.ok(sum.cost.google > 0 && sum.cost.google < 10);
});

test('ssml escapes text and carries the prosody rate', () => {
  const s = A.ssml('a<b & "c"', 'zh-CN-XiaoxiaoNeural', A.SLOW_RATE);
  assert.match(s, /<prosody rate="0.7">a&lt;b &amp; &quot;c&quot;<\/prosody>/);
  assert.ok(!A.ssml('你好', 'v', 1).includes('prosody'));
});

test('mp3Duration walks frames (MPEG-2 layer III, 24 kHz, 48 kbps)', () => {
  /* header: sync, MPEG2 (ver=2), layer III (01), no CRC → 0xFFF3; bitrate idx 6 (48k) + 24 kHz idx 1 → 0x64; */
  const frameLen = Math.floor(72 * 48000 / 24000); /* 144 bytes */
  const frame = Buffer.alloc(frameLen); frame[0] = 0xff; frame[1] = 0xf3; frame[2] = 0x64; frame[3] = 0xc4;
  const id3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const n = 100; /* 100 × 576 samples / 24000 = 2400 ms */
  assert.equal(A.mp3Duration(Buffer.concat([id3, ...Array(n).fill(frame)])), 2400);
  assert.equal(A.mp3Duration(Buffer.from('not an mp3')), undefined);
});

test('withRetry retries 429/5xx and gives up on 4xx', async () => {
  let calls = 0;
  const v = await A.withRetry(async () => { calls++; if (calls < 3) { const e = new Error('busy'); e.status = calls === 1 ? 429 : 503; throw e; } return 'ok'; }, { base: 1 });
  assert.equal(v, 'ok'); assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(A.withRetry(async () => { calls++; const e = new Error('bad'); e.status = 400; throw e; }, { base: 1 }), /bad/);
  assert.equal(calls, 1);
});

test('main writes files and an incremental index with a mock provider', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'senlin-audio-'));
  const mp3 = Buffer.from([0xff, 0xf3, 0x64, 0xc4, ...Array(140).fill(0)]);
  let calls = 0;
  A.providers.mock = { name: 'mock', voice: () => 'mock-voice', check() {}, async synth(text, rate) { calls++; return mp3; } };
  const log = console.log; console.log = () => {};
  try {
    await A.main(['--provider', 'mock', '--out', dir, '--levels', '1', '--kinds', 'chars,sentences', '--limit', '5']);
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    assert.equal(idx.version, 1); assert.equal(idx.provider, 'mock'); assert.equal(idx.voice, 'mock-voice');
    assert.equal(Object.keys(idx.items).length, 5);
    for (const [id, it] of Object.entries(idx.items)) { assert.equal(A.hashId(it.t), id); assert.ok(fs.existsSync(path.join(dir, id + '.mp3'))); assert.equal(it.d, 24); }
    assert.equal(calls, 5);
    /* second run: nothing to do */
    await A.main(['--provider', 'mock', '--out', dir, '--levels', '1', '--kinds', 'chars,sentences', '--limit', '5']);
    assert.equal(calls, 5);
    /* a sentence gets a slow file too */
    await A.main(['--provider', 'mock', '--out', dir, '--levels', '1', '--kinds', 'sentences', '--limit', '1']);
    const it = A.enumerate({ levels: [1], kinds: ['sentences'] })[0];
    assert.ok(fs.existsSync(path.join(dir, it.id + '-slow.mp3')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).items[it.id].s, 1);
    assert.equal(calls, 7);
    /* --force regenerates */
    await A.main(['--provider', 'mock', '--out', dir, '--levels', '1', '--kinds', 'sentences', '--limit', '1', '--force']);
    assert.equal(calls, 9);
  } finally { console.log = log; delete A.providers.mock; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('review: CSV round-trips and rows share audio ids', () => {
  const rows = R.collect({ levels: [4], kinds: ['sentences', 'grammar'] });
  assert.ok(rows.length > 300);
  const audio = new Set(A.enumerate().map(i => i.id));
  rows.forEach(r => { assert.ok(audio.has(r.id), `${r.zh} has no audio id`); assert.ok(r.file && r.path); });
  const tricky = [{ id: 'x', level: 4, kind: 'sentence', zh: '他说：“你好，世界”。', pinyin: 'a', en: 'He said, "hi, world".', status: '', reviewer: '', note: 'a|b\nc' }];
  const back = R.parseCSV(R.toCSV(tricky));
  assert.equal(back.length, 1); assert.equal(back[0].en, tricky[0].en); assert.equal(back[0].note, 'a|b\nc'); assert.equal(back[0].zh, tricky[0].zh);
  assert.equal(R.parseCSV('id,zh\r\n1,木\r\n\r\n').length, 1);
});

test('review: --apply builds a patch without touching data files', () => {
  const rows = R.collect({ levels: [4], kinds: ['sentences'] });
  const [a, b, c, d] = rows;
  const reviewed = [
    { ...a, status: 'ok', reviewer: 'lw' },
    { ...b, status: 'fix', reviewer: 'lw', note: `|${b.pinyin}x|` },
    { ...c, status: 'drop', reviewer: 'lw', note: 'contrived' },
    { ...d, status: 'fix', reviewer: 'lw', note: 'sounds odd' },
    { ...a, id: 'deadbeefdeadbeef', zh: '不存在的句子。', status: 'fix', note: 'x|y|z' },
    { ...a, status: 'maybe' }
  ];
  const before = fs.readFileSync(path.resolve(__dirname, '../js/data/hsk4.js'), 'utf8');
  const patch = R.buildPatch(R.parseCSV(R.toCSV(reviewed)), 'test.csv');
  assert.deepEqual([patch.summary.ok, patch.summary.fix, patch.summary.drop, patch.summary.fixWithoutCorrection, patch.summary.unknownId, patch.summary.unknownStatus], [1, 1, 1, 1, 1, 1]);
  const fix = patch.changes.find(x => x.id === b.id);
  assert.equal(fix.to.zh, b.zh); assert.equal(fix.to.p, b.pinyin + 'x'); assert.equal(fix.newId, b.id); assert.equal(fix.file, 'js/data/hsk4.js'); assert.match(fix.path, /^sentences\[\d+\]$/);
  assert.equal(patch.changes.find(x => x.id === c.id).action, 'drop');
  assert.equal(patch.changes.find(x => x.id === d.id).needsAttention, true);
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../js/data/hsk4.js'), 'utf8'), before);
});
