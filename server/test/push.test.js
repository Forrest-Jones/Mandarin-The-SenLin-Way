import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, fakeFetch, signIn } from './fakes.js';
import { encryptPayload, decryptPayload, vapidAuthHeader, dueNow, runDailyPush } from '../src/push.js';
import { b64urlEncode, b64urlDecode } from '../src/util.js';

async function fakeBrowserSubscription(endpoint) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
  const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  return { kp, subscription: { endpoint, keys: { p256dh, auth } } };
}

test('web push: aes128gcm round trip, VAPID header shape', async () => {
  const { kp, subscription } = await fakeBrowserSubscription('https://push.example.com/send/abc');
  const { body } = await encryptPayload(subscription.keys.p256dh, subscription.keys.auth, JSON.stringify({ title: 'hi', body: '你好' }));
  assert.equal(body[20], 65);                                   // key id length = uncompressed P-256 point
  assert.deepEqual(Array.from(body.slice(16, 20)), [0, 0, 16, 0]);   // rs 4096
  const text = await decryptPayload(body, kp, subscription.keys.auth);
  assert.deepEqual(JSON.parse(text), { title: 'hi', body: '你好' });

  const env = makeEnv();
  const h = await vapidAuthHeader(env, subscription.endpoint);
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h); assert.ok(m);
  const [hdr, payload, sig] = m[1].split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlDecode(hdr))), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  assert.equal(claims.aud, 'https://push.example.com'); assert.ok(claims.exp > Date.now() / 1000); assert.match(claims.sub, /^mailto:/);
  assert.equal(b64urlDecode(sig).length, 64);
  // verify the signature with the public key from the header
  const pub = await crypto.subtle.importKey('raw', b64urlDecode(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlDecode(sig), new TextEncoder().encode(`${hdr}.${payload}`)), true);
  // keys are stable across calls (kept in KV)
  assert.equal((await vapidAuthHeader(env, subscription.endpoint)).split('k=')[1], m[2]);
});

test('web push: subscribe, due-time logic, daily send, dead endpoints pruned', async () => {
  const calls = [];
  const FETCH = fakeFetch({ 'push.example.com/dead': () => new Response('', { status: 410 }), 'push.example.com': (url, init) => { calls.push({ url, init }); return new Response('', { status: 201 }); } });
  const env = makeEnv({ FETCH });
  const a = await fakeBrowserSubscription('https://push.example.com/send/a');
  const b = await fakeBrowserSubscription('https://push.example.com/dead');
  const r = await worker.fetch(req('/v1/push/subscribe', { method: 'POST', headers: { 'x-senlin-anon': 'anon-1' }, body: { subscription: a.subscription, hour: 7, minute: 30, tz: 'America/New_York' } }), env, new FakeCtx());
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true, hour: 7, minute: 30, tz: 'America/New_York' });
  assert.equal((await worker.fetch(req('/v1/push/subscribe', { method: 'POST', body: { subscription: b.subscription, hour: 7, minute: 30, tz: 'Nowhere/Land' } }), env, new FakeCtx())).status, 400);
  await worker.fetch(req('/v1/push/subscribe', { method: 'POST', body: { subscription: b.subscription, hour: 7, minute: 30, tz: 'America/New_York' } }), env, new FakeCtx());
  const vapid = await (await worker.fetch(req('/v1/push/vapid'), env, new FakeCtx())).json(); assert.equal(b64urlDecode(vapid.publicKey).length, 65);

  // 07:35 New York on 2026-09-21 = 11:35Z (EDT)
  const at = new Date('2026-09-21T11:35:00Z');
  const subs = [{ endpoint: 'x', hour: 7, minute: 30, tz: 'America/New_York', last_sent: null }, { endpoint: 'y', hour: 7, minute: 30, tz: 'Asia/Shanghai', last_sent: null }, { endpoint: 'z', hour: 7, minute: 30, tz: 'America/New_York', last_sent: '2026-09-21T07:31' }];
  assert.deepEqual(dueNow(subs, at).map((s) => s.endpoint), ['x']);
  assert.deepEqual(dueNow(subs, new Date('2026-09-21T11:50:00Z')).map((s) => s.endpoint), []);   // window passed

  const res = await runDailyPush(env, at);
  assert.deepEqual(res, { due: 2, sent: 1, gone: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['content-encoding'], 'aes128gcm');
  assert.match(calls[0].init.headers.authorization, /^vapid t=/);
  const text = await decryptPayload(new Uint8Array(calls[0].init.body), a.kp, a.subscription.keys.auth);
  assert.match(JSON.parse(text).title, /10 minutes/);
  // second run in the same window sends nothing (already sent today); the dead one is gone
  assert.deepEqual(await runDailyPush(env, new Date('2026-09-21T11:40:00Z')), { due: 0, sent: 0, gone: 0 });
  // unsubscribe
  assert.equal((await worker.fetch(req('/v1/push/subscribe', { method: 'DELETE', body: { endpoint: a.subscription.endpoint } }), env, new FakeCtx())).status, 204);
  assert.deepEqual(await runDailyPush(env, new Date('2026-09-22T11:35:00Z')), { due: 0, sent: 0, gone: 0 });
});

test('reminderFor: personalised by the synced snapshot (next day, catch-up, done, finished course, no data)', async () => {
  const { reminderFor } = await import('../src/push.js');
  const schedule = [['The four tones', ''], ['Actors: b p m f', ''], ['Phase 1 · HSK 1', '木 林 森'], ['Phase 1 · HSK 1', '我 你 他']];
  const blob = { settings: { startDate: '2026-09-20' }, progress: { completed: { 1: 'x', 2: 'x' } } };
  assert.deepEqual(reminderFor(blob, '2026-09-22', schedule), { title: 'Day 3 · ten minutes 🌱', body: '木 林 森 — one tree, ten minutes.', url: '#/lesson/3' });
  assert.deepEqual(reminderFor({ settings: { startDate: '2026-09-20' }, progress: { completed: { 1: 'x' } } }, '2026-09-21', schedule), { title: 'Day 2 · ten minutes 🌱', body: 'Actors: b p m f — one tree, ten minutes.', url: '#/lesson/2' });
  // a brand-new learner on day 2 who never did day 1 is pointed at day 1, like the Today screen
  assert.equal(reminderFor({ settings: { startDate: '2026-09-20' } }, '2026-09-21', schedule).url, '#/lesson/1');
  // day 4 with day 3 missed → catch up with 3 first
  assert.deepEqual(reminderFor(blob, '2026-09-23', schedule), { title: 'Catch up: Day 3 🌱', body: '木 林 森 — one tree, ten minutes.', url: '#/lesson/3' });
  // already done today → review nudge
  assert.equal(reminderFor({ settings: { startDate: '2026-09-20' }, progress: { completed: { 1: 'x', 2: 'x', 3: 'x' } } }, '2026-09-22', schedule).url, '#/review');
  // past the schedule with everything done
  assert.equal(reminderFor({ settings: { startDate: '2026-09-20' }, progress: { completed: { 1: 1, 2: 1, 3: 1, 4: 1 } } }, '2026-09-30', schedule).url, '#/review');
  // no snapshot, bad dates → the generic line
  assert.equal(reminderFor(null, '2026-09-22', schedule).body, 'One tree a day. Today’s lesson is ready.');
  assert.equal(reminderFor({ settings: { startDate: 'soon' } }, '2026-09-22', schedule).url, '#/lesson');
  // the real table is the whole curriculum
  const real = reminderFor({ settings: { startDate: '2026-09-01' }, progress: { completed: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 1])) } }, '2026-09-13');
  assert.equal(real.url, '#/lesson/13'); assert.match(real.body, /^木 林 森/);
});

test('runDailyPush uses the signed-in learner’s snapshot for the reminder text', async () => {
  const calls = [];
  const FETCH = fakeFetch({ 'push.example.com': (url, init) => { calls.push({ url, init }); return new Response('', { status: 201 }); } });
  const env = makeEnv({ FETCH });
  const { token } = await signIn(env, worker, 'planter@example.com');
  const ctx = new FakeCtx();
  const start = '2026-09-10';
  assert.equal((await worker.fetch(req('/v1/sync', { method: 'PUT', token, body: { version: 0, data: { settings: { startDate: start }, progress: { completed: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1 } } } } }), env, ctx)).status, 200);
  await ctx.done();
  const a = await fakeBrowserSubscription('https://push.example.com/send/p');
  assert.equal((await worker.fetch(req('/v1/push/subscribe', { method: 'POST', token, body: { subscription: a.subscription, hour: 7, minute: 30, tz: 'America/New_York' } }), env, new FakeCtx())).status, 200);
  // 2026-09-22 New York = Day 13 for a 2026-09-10 start
  const res = await runDailyPush(env, new Date('2026-09-22T11:35:00Z'));
  assert.deepEqual(res, { due: 1, sent: 1, gone: 0 });
  const text = JSON.parse(await decryptPayload(new Uint8Array(calls[0].init.body), a.kp, a.subscription.keys.auth));
  assert.equal(text.title, 'Day 13 · ten minutes 🌱');
  assert.match(text.body, /^木 林 森/);
  assert.equal(text.url, '#/lesson/13');
});
