import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, signIn } from './fakes.js';

test('sync: put/get/conflict/backups', async () => {
  const env = makeEnv();
  const { token } = await signIn(env, worker);
  const ctx = new FakeCtx();

  const none = await worker.fetch(req('/v1/sync', { token }), env, ctx);
  assert.equal(none.status, 404);
  assert.equal((await none.json()).error, 'none');

  const p1 = await worker.fetch(req('/v1/sync', { method: 'PUT', token, body: { version: 0, data: { day: 1, xp: 10 } } }), env, ctx);
  assert.equal(p1.status, 200);
  const j1 = await p1.json();
  assert.equal(j1.version, 1);
  assert.ok(j1.updatedAt);

  const g1 = await worker.fetch(req('/v1/sync', { token }), env, ctx);
  const gj = await g1.json();
  assert.equal(gj.version, 1);
  assert.deepEqual(gj.data, { day: 1, xp: 10 });

  // stale version -> 409 with the server copy
  const stale = await worker.fetch(req('/v1/sync', { method: 'PUT', token, body: { version: 0, data: { day: 2 } } }), env, ctx);
  assert.equal(stale.status, 409);
  const sj = await stale.json();
  assert.equal(sj.error, 'conflict');
  assert.equal(sj.version, 1);
  assert.deepEqual(sj.data, { day: 1, xp: 10 });

  // correct version -> 2, previous version backed up
  const p2 = await worker.fetch(req('/v1/sync', { method: 'PUT', token, body: { version: 1, data: { day: 2, xp: 20 } } }), env, ctx);
  assert.equal((await p2.json()).version, 2);
  const list = await worker.fetch(req('/v1/sync/backups', { token }), env, ctx);
  const lj = await list.json();
  assert.equal(lj.backups.length, 1);
  assert.equal(lj.backups[0].version, 1);
  assert.equal(lj.backups[0].bytes, JSON.stringify({ day: 1, xp: 10 }).length);
  const b1 = await worker.fetch(req('/v1/sync/backups/1', { token }), env, ctx);
  assert.deepEqual((await b1.json()).data, { day: 1, xp: 10 });
  const b9 = await worker.fetch(req('/v1/sync/backups/9', { token }), env, ctx);
  assert.equal(b9.status, 404);

  // only the last 10 backups are kept
  for (let v = 2; v < 16; v++) {
    const r = await worker.fetch(req('/v1/sync', { method: 'PUT', token, body: { version: v, data: { day: v + 1 } } }), env, ctx);
    assert.equal(r.status, 200, `put v${v}`);
  }
  const lj2 = await (await worker.fetch(req('/v1/sync/backups', { token }), env, ctx)).json();
  assert.equal(lj2.backups.length, 10);
  assert.equal(lj2.backups[0].version, 15);
  assert.equal(lj2.backups[9].version, 6);
});

test('sync: rejects oversize and non-object data, requires auth', async () => {
  const env = makeEnv();
  const { token } = await signIn(env, worker);
  const big = { blob: 'x'.repeat(2 * 1024 * 1024 + 1) };
  const r = await worker.fetch(req('/v1/sync', { method: 'PUT', token, body: { version: 0, data: big } }), env, new FakeCtx());
  assert.equal(r.status, 413);
  const bad = await worker.fetch(req('/v1/sync', { method: 'PUT', token, body: { version: 0, data: 'str' } }), env, new FakeCtx());
  assert.equal(bad.status, 400);
  const noauth = await worker.fetch(req('/v1/sync', { method: 'PUT', body: { version: 0, data: {} } }), env, new FakeCtx());
  assert.equal(noauth.status, 401);
});
