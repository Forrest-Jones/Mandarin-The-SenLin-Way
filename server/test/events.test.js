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

test('an OWNER_EMAIL account can read the admin stats without the key', async () => {
  const env = makeEnv({ OWNER_EMAIL: 'owner@example.com', ADMIN_KEY: 'adm' });
  const { token } = await signIn(env, worker, 'owner@example.com');
  const r = await worker.fetch(req('/v1/admin/stats', { headers: { authorization: `Bearer ${token}` } }), env, new FakeCtx());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.users.total, 1);
  assert.equal(j.users.pro, 0);
  assert.ok(Array.isArray(j.recentErrors));
  const other = await signIn(env, worker, 'someone@example.com');
  const denied = await worker.fetch(req('/v1/admin/stats', { headers: { authorization: `Bearer ${other.token}` } }), env, new FakeCtx());
  assert.equal(denied.status, 401);
});

test('cohorts: day-1 / day-7 return rates and the visit → lesson funnel', async () => {
  const { cohorts } = await import('../src/events.js');
  const now = Date.parse('2026-09-27T12:00:00Z');
  const at = (daysAgo, hour = 10) => new Date(now - daysAgo * 86400e3 + (hour - 12) * 3600e3).toISOString();
  const rows = [
    // a: first seen 10 days ago, back the next day and on day 7, finished a lesson → retained on both, funnel done
    { actor: 'a', name: 'visit', ts: at(10) }, { actor: 'a', name: 'lesson_start', ts: at(10) }, { actor: 'a', name: 'lesson_done', ts: at(10) },
    { actor: 'a', name: 'visit', ts: at(9) }, { actor: 'a', name: 'visit', ts: at(3) },
    // b: first seen 10 days ago, never came back, only looked
    { actor: 'b', name: 'visit', ts: at(10) },
    // c: first seen yesterday → too young for either cohort, but in the funnel (started, not done)
    { actor: 'c', name: 'visit', ts: at(1) }, { actor: 'c', name: 'lesson_start', ts: at(1) },
    // d: first seen 40 days ago → outside the 30-day cohorts entirely
    { actor: 'd', name: 'visit', ts: at(40) }, { actor: 'd', name: 'visit', ts: at(39) },
    // e: first seen 5 days ago, back next day → day-1 cohort only (day-7 window still open)
    { actor: 'e', name: 'visit', ts: at(5) }, { actor: 'e', name: 'visit', ts: at(4) },
    { actor: '', name: 'visit', ts: at(2) }, { actor: 'f', name: 'visit', ts: 'not a date' },
  ];
  const r = cohorts(rows, now);
  assert.deepEqual(r.day1, { learners: 3, returned: 2, pct: 67 });
  assert.deepEqual(r.day7, { learners: 2, returned: 1, pct: 50 });
  assert.deepEqual(r.funnel, { visited: 4, started: 2, done: 1 });
  assert.deepEqual(cohorts([], now), { day1: { learners: 0, returned: 0, pct: null }, day7: { learners: 0, returned: 0, pct: null }, funnel: { visited: 0, started: 0, done: 0 } });
});
