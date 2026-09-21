// Native-speaker review of the course text (any HSK level, Deal Desk) with Claude, filling the same columns a human
// editor would (status ok|fix, note "zh|pinyin|en|comment"). Reads review/<name>.csv, writes
// review/<name>-reviewed.csv. Run from CI (ANTHROPIC_API_KEY) or a laptop:
//   node tools/ai-review.mjs [--files hsk4,hsk5,hsk6,business] [--batch 20] [--concurrency 4] [--model claude-opus-5]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const require = createRequire(import.meta.url);
const { parseCSV, toCSV, COLUMNS } = require('./review.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
const FILES = (args.files || 'hsk4,hsk5,hsk6,business').split(',');
const BATCH = Number(args.batch || 20), CONCURRENCY = Number(args.concurrency || 4), MODEL = args.model || 'claude-opus-5';

const Review = z.object({
  items: z.array(z.object({
    id: z.string(),
    status: z.enum(['ok', 'fix']),
    zh: z.string().describe('corrected Chinese, or empty string to keep'),
    pinyin: z.string().describe('corrected pinyin with tone marks, or empty string to keep'),
    en: z.string().describe('corrected English, or empty string to keep'),
    comment: z.string().describe('one short sentence on why, empty if ok'),
  })),
});

const SYSTEM = `You are a native Mandarin editor (Beijing standard, mainland usage) reviewing sentences for an HSK-aligned course. For each item decide:
- "ok": natural, correct simplified Chinese; pinyin exactly matches with tone marks. This course WRITES the spoken tone sandhi of 不 and 一 (bú before a 4th tone: búshì, búyào; yí before a 4th tone: yíxià, yí ge; yì before 1st/2nd/3rd: yìqǐ, yìbān, yìzhí; reduplicated verbs keep the neutral yi: kàn yi kàn; numbers, ordinals and dates keep yī: dì-yī, shíyī). Never "fix" a sandhi spelling to the dictionary tone; 3rd+3rd stays written 3rd+3rd; English translation faithful.
- "fix": anything unnatural, ungrammatical, non-mainland, wrong punctuation (Chinese must use 。，？！、), pinyin tone/spelling errors, spacing (pinyin per word, capital at sentence start), or an English rendering that misleads.
Only mark "fix" when a careful native editor would change it; do not restyle acceptable sentences. When fixing, return the corrected field(s) and leave the others as empty strings. Business items must keep a formal finance register (您, 贵方, 我方). Never change the meaning; never add characters beyond the course's level unless required for correctness.`;

const client = new Anthropic({ defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : undefined });
const seen = new Map();   // id → review result (cache across batches)

async function reviewBatch(rows) {
  const payload = rows.map((r) => ({ id: r.id, level: r.level, kind: r.kind, zh: r.zh, pinyin: r.pinyin, en: r.en }));
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Review these ${rows.length} items and return one result per id:\n${JSON.stringify(payload, null, 1)}` }],
    output_config: { format: zodOutputFormat(Review), effort: 'medium' },
  });
  if (res.stop_reason === 'refusal') throw new Error('refused');
  const items = res.parsed_output?.items || [];
  for (const it of items) seen.set(it.id, it);
  return res.usage;
}

async function runWithConcurrency(tasks, n) {
  const queue = tasks.slice(); const usage = { input: 0, output: 0 }; let failed = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) {
      const t = queue.shift();
      for (let attempt = 1; attempt <= 3; attempt++) {
        try { const u = await t(); usage.input += u.input_tokens; usage.output += u.output_tokens; break; }
        catch (e) { if (attempt === 3) { failed++; console.error('batch failed:', e.message); } else await new Promise((r) => setTimeout(r, 2000 * attempt)); }
      }
    }
  }));
  return { usage, failed };
}

for (const name of FILES) {
  const src = path.join(ROOT, 'review', `${name}.csv`);
  if (!fs.existsSync(src)) { console.log(`skip ${name}: no review/${name}.csv (run node tools/review.js first)`); continue; }
  const rows = parseCSV(fs.readFileSync(src, 'utf8'));
  const batches = []; for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
  console.log(`${name}: ${rows.length} rows in ${batches.length} batches → ${MODEL}`);
  const { usage, failed } = await runWithConcurrency(batches.map((b) => () => reviewBatch(b)), CONCURRENCY);
  let fixes = 0, unreviewed = 0;
  const out = rows.map((r) => {
    const v = seen.get(r.id);
    if (!v) { unreviewed++; return r; }
    if (v.status === 'ok') return { ...r, status: 'ok', reviewer: `claude:${MODEL}`, note: '' };
    fixes++;
    return { ...r, status: 'fix', reviewer: `claude:${MODEL}`, note: [v.zh || '', v.pinyin || '', v.en || '', (v.comment || '').replace(/\|/g, '/')].join('|') };
  });
  fs.writeFileSync(path.join(ROOT, 'review', `${name}-reviewed.csv`), toCSV(out));
  console.log(`  ${rows.length - fixes - unreviewed} ok · ${fixes} fix · ${unreviewed} unreviewed · ${failed} failed batch(es) · tokens in ${usage.input} out ${usage.output}`);
}
