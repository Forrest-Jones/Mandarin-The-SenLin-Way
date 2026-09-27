import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, signIn, fakeFetch } from './fakes.js';

test('DELETE /v1/me removes the account, its sync data, usage, reminders and events; the token stops working', async () => {
  const env = makeEnv();
  const ctx = new FakeCtx();
  const { token } = await signIn(env, worker, 'leaver@example.com');
  const other = await signIn(env, worker, 'stays@example.com');
  assert.equal((await worker.fetch(req('/v1/sync', { method: 'PUT', token, body: { version: 0, data: { day: 3 } } }), env, ctx)).status, 200);
  assert.equal((await worker.fetch(req('/v1/sync', { method: 'PUT', token: other.token, body: { version: 0, data: { day: 9 } } }), env, ctx)).status, 200);
  await ctx.done();
  assert.equal((await worker.fetch(req('/v1/events', { method: 'POST', token, body: { events: [{ name: 'lesson_done', ts: new Date().toISOString() }] } }), env, ctx)).status, 204);
  await ctx.done();
  assert.equal(env.DB.tables.users.length, 2);
  assert.ok(env.DB.tables.sync_blobs.length >= 2);

  const denied = await worker.fetch(req('/v1/me', { method: 'DELETE' }), env, ctx);
  assert.equal(denied.status, 401);

  const r = await worker.fetch(req('/v1/me', { method: 'DELETE', token }), env, ctx);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.deleted.syncBlobs, 1);
  assert.equal(j.deleted.events, 1);
  assert.equal(j.stripe.cancelled, 0);

  assert.equal(env.DB.tables.users.length, 1);
  assert.equal(env.DB.tables.users[0].email, 'stays@example.com');
  assert.equal(env.DB.tables.sync_blobs.filter((b) => b.user_id !== env.DB.tables.users[0].id).length, 0);
  assert.equal(env.DB.tables.events.filter((e) => e.user_id && e.user_id !== env.DB.tables.users[0].id).length, 0);
  assert.equal((await worker.fetch(req('/v1/me', { token }), env, ctx)).status, 401);
  assert.equal((await worker.fetch(req('/v1/me', { token: other.token }), env, ctx)).status, 200);
});

test('DELETE /v1/me cancels the active Stripe subscriptions of a web subscriber first', async () => {
  const FETCH = fakeFetch({
    'subscriptions/sub_1': () => new Response(JSON.stringify({ id: 'sub_1', status: 'canceled' })),
    'subscriptions?': () => new Response(JSON.stringify({ data: [{ id: 'sub_1' }] })),
  });
  const env = makeEnv({ STRIPE_SECRET_KEY: 'sk_test_x', FETCH });
  const { token } = await signIn(env, worker, 'payer@example.com');
  env.DB.tables.users[0].stripe_customer = 'cus_9'; env.DB.tables.users[0].plan = 'pro';
  const r = await worker.fetch(req('/v1/me', { method: 'DELETE', token }), env, new FakeCtx());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.stripe.cancelled, 1);
  assert.ok(FETCH.calls.some((c) => /subscriptions\?customer=cus_9/.test(c.url) && c.init.method === 'GET'));
  assert.ok(FETCH.calls.some((c) => /subscriptions\/sub_1$/.test(c.url) && c.init.method === 'DELETE'));
  assert.equal(env.DB.tables.users.length, 0);
});
