import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSetup, findNamespaceId } from '../scripts/stripe-setup.mjs';
import { fakeFetch } from './fakes.js';

test('CI stripe setup script: persists config through kv callbacks and needs no admin key', async () => {
  const store = new Map();
  const FETCH = fakeFetch({
    'products/search': () => new Response(JSON.stringify({ data: [{ id: 'prod_x' }] })),
    'https://api.stripe.com/v1/prices?': () => new Response(JSON.stringify({ data: [] })),
    'https://api.stripe.com/v1/prices': (url, init) => new Response(JSON.stringify({ id: 'price_' + new URLSearchParams(init.body).get('lookup_key') })),
    'webhook_endpoints?': () => new Response(JSON.stringify({ data: [] })),
    'webhook_endpoints': () => new Response(JSON.stringify({ id: 'we_9', secret: 'whsec_9' })),
    'billing_portal/configurations': () => new Response(JSON.stringify({ id: 'bpc_9' })),
  });
  const out = await runSetup({ stripeKey: 'sk_test_1', workerUrl: 'https://senlin-api.example.workers.dev/', fetchImpl: FETCH, kvGet: async (k) => store.get(k) ?? null, kvPut: async (k, v) => store.set(k, v) });
  assert.equal(out.ok, true);
  assert.equal(out.webhookUrl, 'https://senlin-api.example.workers.dev/v1/webhooks/stripe');
  const saved = JSON.parse(store.get('stripe:config'));
  assert.equal(saved.webhookSecret, 'whsec_9');
  assert.deepEqual(saved.prices, { monthly: 'price_pro_monthly', yearly: 'price_pro_yearly', lifetime: 'price_pro_lifetime' });
  assert.equal(findNamespaceId(JSON.stringify([{ id: 'abc', title: 'senlin-api-CACHE' }, { id: 'zzz', title: 'other' }])), 'abc');
});
