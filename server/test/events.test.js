import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, signIn } from './fakes.js';

test('events: whitelist, anonymous + signed-in, cap 50', async () => {
  const env = makeEnv({ ADMIN_KEY: 'adm' });
  const anonHeaders = { 'x-senlin-anon': 'anon-1234567890' };
  const r = await worker.fetch(req('/v1/events', { method: 'POST', headers: anonHeaders, body: { events: [
    { name: 'lesson_done', props: { day: 3 }, ts: Date.now() },
    { name: 'drop_table', props: {} },
    { name: 'install', ts: 'not a date' },
  ] } }), env, new FakeCtx());
  assert.equal(r.status, 204);
  assert.equal(env.DB.tables.events.length, 2);
  assert.deepEqual(env.DB.tables.events.map((e) => e.name), ['lesson_done', 'install']);
  assert.equal(env.DB.tables.events[0].anon, 'anon-1234567890');
  assert.equal(env.DB.tables.events[0].user_id, null);
  assert.equal(env.DB.tables.events[0].props, '{"day":3}');
  assert.match(env.DB.tables.events[1].ts, /^\d{4}-\d{2}-\d{2}T/);

  const { token } = await signIn(env, worker);
  const r2 = await worker.fetch(req('/v1/events', { method: 'POST', token, body: { events: [{ name: 'review', ts: Date.now() }] } }), env, new FakeCtx());
  assert.equal(r2.status, 204);
  assert.ok(env.DB.tables.events[2].user_id);
  assert.equal(env.DB.tables.events[2].anon, null);

  const noId = await worker.fetch(req('/v1/events', { method: 'POST', body: { events: [{ name: 'review' }] } }), env, new FakeCtx());
  assert.equal(noId.status, 400);
  const badTok = await worker.fetch(req('/v1/events', { method: 'POST', token: 'bad', body: { events: [] } }), env, new FakeCtx());
  assert.equal(badTok.status, 401);
  const many = await worker.fetch(req('/v1/events', { method: 'POST', headers: anonHeaders, body: { events: Array.from({ length: 51 }, () => ({ name: 'review' })) } }), env, new FakeCtx());
  assert.equal(many.status, 400);

  // errors endpoint
  const e = await worker.fetch(req('/v1/errors', { method: 'POST', body: { message: 'TypeError: x', stack: 'at y', url: 'https://x/y', version: '1' } }), env, new FakeCtx());
  assert.equal(e.status, 204);
  assert.equal(env.DB.tables.errors.length, 1);

  // admin stats
  const denied = await worker.fetch(req('/v1/admin/stats'), env, new FakeCtx());
  assert.equal(denied.status, 401);
  const stats = await worker.fetch(req('/v1/admin/stats', { headers: { 'x-admin-key': 'adm' } }), env, new FakeCtx());
  assert.equal(stats.status, 200);
  const sj = await stats.json();
  assert.equal(sj.users.total, 1);
  assert.equal(sj.activeUsers.last7d, 2);
  assert.equal(sj.activeUsers.last30d, 2);
  assert.equal(sj.lessonsDone.total, 1);
  assert.equal(sj.errorsLast24h, 1);
  assert.equal(sj.aiMessages.total, 0);
});
