// Runs the same one-shot Stripe setup as GET /v1/admin/stripe-setup, but from CI (or a laptop),
// talking to Stripe directly and writing the result into the worker's KV with Wrangler.
// Needs: STRIPE_SECRET_KEY, WORKER_URL (https://senlin-api.<sub>.workers.dev), CLOUDFLARE_API_TOKEN (for wrangler).
//   node scripts/stripe-setup.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleStripeSetup } from '../src/billing.js';

const KV_KEY = 'stripe:config';

function wrangler(args, input) {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
}

/** Find the KV namespace Wrangler provisioned for the CACHE binding. */
export function findNamespaceId(listJson) {
  const list = JSON.parse(listJson);
  const hit = list.find((n) => /senlin-api.*CACHE|CACHE.*senlin-api|^senlin-api-CACHE$/i.test(n.title)) || list.find((n) => /CACHE/i.test(n.title));
  if (!hit) throw new Error('No KV namespace with CACHE in its title. Deploy the worker first.');
  return hit.id;
}

/** Pure runner (tested): setup against Stripe through `fetchImpl`, config persisted through kvGet/kvPut. */
export async function runSetup({ stripeKey, workerUrl, fetchImpl, kvGet, kvPut, siteUrl }) {
  const env = {
    STRIPE_SECRET_KEY: stripeKey, ADMIN_KEY: 'ci', SITE_URL: siteUrl, FETCH: fetchImpl,
    CACHE: {
      async get(key, type) { const v = await kvGet(key); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
      async put(key, value) { await kvPut(key, value); },
    },
  };
  const res = await handleStripeSetup(new Request(`${workerUrl.replace(/\/+$/, '')}/v1/admin/stripe-setup?key=ci`), env);
  return res.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { STRIPE_SECRET_KEY, WORKER_URL, SITE_URL } = process.env;
  if (!STRIPE_SECRET_KEY || !WORKER_URL) { console.error('STRIPE_SECRET_KEY and WORKER_URL are required'); process.exit(2); }
  const nsId = findNamespaceId(wrangler(['kv', 'namespace', 'list']));
  const kvGet = async (key) => { try { return wrangler(['kv', 'key', 'get', key, '--namespace-id', nsId, '--remote']).trim() || null; } catch { return null; } };
  const kvPut = async (key, value) => {
    const f = join(mkdtempSync(join(tmpdir(), 'senlin-')), 'value.json');   // wrangler reads --path from a real file only
    writeFileSync(f, value); try { wrangler(['kv', 'key', 'put', key, '--namespace-id', nsId, '--remote', '--path', f]); } finally { unlinkSync(f); }
  };
  const out = await runSetup({ stripeKey: STRIPE_SECRET_KEY, workerUrl: WORKER_URL, fetchImpl: globalThis.fetch, kvGet, kvPut, siteUrl: SITE_URL });
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}
