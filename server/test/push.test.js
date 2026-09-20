import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, fakeFetch } from './fakes.js';
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
