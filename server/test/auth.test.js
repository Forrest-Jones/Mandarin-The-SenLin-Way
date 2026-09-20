import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, signIn } from './fakes.js';

test('auth: request + verify with DEV_ECHO_CODE creates a user and returns a token', async () => {
  const env = makeEnv();
  const r1 = await worker.fetch(req('/v1/auth/request', { method: 'POST', body: { email: 'Learner@Example.com ' } }), env, new FakeCtx());
  assert.equal(r1.status, 200);
  const j1 = await r1.json();
  assert.equal(j1.ok, true);
  assert.match(j1.code, /^\d{6}$/);

  const bad = await worker.fetch(req('/v1/auth/verify', { method: 'POST', body: { email: 'learner@example.com', code: '000000' } }), env, new FakeCtx());
  assert.equal(bad.status, 401);

  const r2 = await worker.fetch(req('/v1/auth/verify', { method: 'POST', body: { email: 'learner@example.com', code: j1.code } }), env, new FakeCtx());
  assert.equal(r2.status, 200);
  const j2 = await r2.json();
  assert.ok(j2.token);
  assert.equal(j2.user.email, 'learner@example.com');
  assert.equal(j2.user.plan, 'free');
  assert.equal(env.DB.tables.users.length, 1);

  // code is single-use
  const again = await worker.fetch(req('/v1/auth/verify', { method: 'POST', body: { email: 'learner@example.com', code: j1.code } }), env, new FakeCtx());
  assert.equal(again.status, 401);

  // /v1/me works with the token and the same user is reused on the next sign-in
  const me = await worker.fetch(req('/v1/me', { token: j2.token }), env, new FakeCtx());
  assert.equal(me.status, 200);
  const mj = await me.json();
  assert.equal(mj.user.id, j2.user.id);
  assert.deepEqual(mj.usage, { aiMessagesToday: 0, aiTokensMonth: 0, ttsCharsMonth: 0, sttSecondsMonth: 0 });
  assert.equal(mj.limits.aiMessagesPerDay, 25);
  const second = await signIn(env, worker, 'learner@example.com');
  assert.equal(second.user.id, j2.user.id);
  assert.equal(env.DB.tables.users.length, 1);
});

test('auth: no code echo without DEV_ECHO_CODE and no email provider -> 503', async () => {
  const env = makeEnv({ DEV_ECHO_CODE: '0' });
  const r = await worker.fetch(req('/v1/auth/request', { method: 'POST', body: { email: 'a@b.co' } }), env, new FakeCtx());
  assert.equal(r.status, 503);
});

test('auth: max 5 code requests per hour per email', async () => {
  const env = makeEnv();
  for (let i = 0; i < 5; i++) {
    const r = await worker.fetch(req('/v1/auth/request', { method: 'POST', body: { email: 'a@b.co' } }), env, new FakeCtx());
    assert.equal(r.status, 200);
  }
  const r = await worker.fetch(req('/v1/auth/request', { method: 'POST', body: { email: 'a@b.co' } }), env, new FakeCtx());
  assert.equal(r.status, 429);
  assert.equal((await r.json()).limit, 'rate');
});

test('auth: bad email / missing bearer', async () => {
  const env = makeEnv();
  const r = await worker.fetch(req('/v1/auth/request', { method: 'POST', body: { email: 'nope' } }), env, new FakeCtx());
  assert.equal(r.status, 400);
  const me = await worker.fetch(req('/v1/me'), env, new FakeCtx());
  assert.equal(me.status, 401);
  const me2 = await worker.fetch(req('/v1/me', { token: 'not.a.jwt' }), env, new FakeCtx());
  assert.equal(me2.status, 401);
});

test('cors: preflight and allowed origins', async () => {
  const env = makeEnv();
  const pre = await worker.fetch(req('/v1/me', { method: 'OPTIONS', headers: { origin: 'https://forrest-jones.github.io', 'access-control-request-method': 'GET' } }), env, new FakeCtx());
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://forrest-jones.github.io');
  assert.match(pre.headers.get('access-control-expose-headers'), /Authorization, Content-Type/);
  const dev = await worker.fetch(req('/v1/health', { headers: { origin: 'http://localhost:8080' } }), env, new FakeCtx());
  assert.equal(dev.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  const evil = await worker.fetch(req('/v1/health', { headers: { origin: 'https://evil.example' } }), env, new FakeCtx());
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const health = await dev.json();
  assert.equal(health.ok, true);
  assert.deepEqual(health.providers, { ai: false, tts: null, stt: null, email: false });
  const nf = await worker.fetch(req('/v1/nope'), env, new FakeCtx());
  assert.equal(nf.status, 404);
});

test('password sign-in: create, sign in, wrong password, weak password, unknown email', async () => {
  const env = makeEnv({ DEV_ECHO_CODE: '' });
  const post = (body) => worker.fetch(req('/v1/auth/password', { method: 'POST', body }), env, new FakeCtx());
  assert.equal((await post({ email: 'pw@example.com', password: 'short' })).status, 400);
  assert.equal((await post({ email: 'pw@example.com', password: 'longenough1' })).status, 404);      // no account yet, no create flag
  const created = await post({ email: 'pw@example.com', password: 'longenough1', create: true });
  assert.equal(created.status, 200);
  const c = await created.json(); assert.equal(c.created, true); assert.ok(c.token); assert.equal(c.user.email, 'pw@example.com');
  const again = await post({ email: 'PW@example.com', password: 'longenough1' });
  assert.equal(again.status, 200); assert.equal((await again.json()).created, false);
  assert.equal((await post({ email: 'pw@example.com', password: 'wrongpass1' })).status, 401);
  assert.equal((await post({ email: 'pw@example.com', password: 'wrongpass1', create: true })).status, 401);   // create cannot overwrite an existing password
  const me = await worker.fetch(req('/v1/me', { token: c.token }), env, new FakeCtx());
  assert.equal(me.status, 200);
});
