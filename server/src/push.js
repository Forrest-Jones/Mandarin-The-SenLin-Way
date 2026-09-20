// Web Push daily reminders: VAPID keys kept in KV, subscriptions in D1, a cron that sends
// "your 10 minutes" at each learner's chosen local time. RFC 8291 (aes128gcm) + RFC 8292 (VAPID)
// implemented with WebCrypto only.
import { HttpError, json, noContent, readJson, nowIso, b64urlEncode, b64urlDecode, upstreamFetch } from './util.js';
import { getUser } from './auth.js';
import { first, all, run } from './db.js';

const VAPID_KV = 'push:vapid';
const SUBJECT = (env) => env.PUSH_SUBJECT || 'mailto:forrestjones2010@gmail.com';

// ---------- VAPID keys (generated once) ----------
export async function vapidKeys(env) {
  let stored = env.CACHE ? await env.CACHE.get(VAPID_KV, 'json') : null;
  if (!stored) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));      // 65 bytes, uncompressed point
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    stored = { publicKey: b64urlEncode(pub), privateJwk: jwk, createdAt: nowIso() };
    if (env.CACHE) await env.CACHE.put(VAPID_KV, JSON.stringify(stored));
  }
  return stored;
}

// GET /v1/push/vapid → { publicKey }
export async function handleVapid(request, env) {
  const k = await vapidKeys(env);
  return json({ publicKey: k.publicKey });
}

// POST /v1/push/subscribe { subscription: {endpoint, keys:{p256dh, auth}}, hour, minute, tz }
export async function handleSubscribe(request, env) {
  const body = await readJson(request, 8192);
  const sub = body.subscription || {};
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth || !/^https:\/\//.test(sub.endpoint)) throw new HttpError(400, 'bad_subscription');
  const hour = Math.min(23, Math.max(0, Number(body.hour ?? 7) | 0));
  const minute = Math.min(59, Math.max(0, Number(body.minute ?? 0) | 0));
  const tz = String(body.tz || 'UTC').slice(0, 64);
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { throw new HttpError(400, 'bad_timezone'); }
  const user = request.headers.get('authorization') ? await getUser(request, env) : null;
  const anon = request.headers.get('x-senlin-anon') || null;
  await run(env, 'INSERT INTO push_subs (id, user_id, anon, endpoint, p256dh, auth, hour, minute, tz, created_at, last_sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, anon = excluded.anon, p256dh = excluded.p256dh, auth = excluded.auth, hour = excluded.hour, minute = excluded.minute, tz = excluded.tz',
    crypto.randomUUID(), user ? user.id : null, anon, sub.endpoint, sub.keys.p256dh, sub.keys.auth, hour, minute, tz, nowIso(), null);
  return json({ ok: true, hour, minute, tz });
}

// DELETE /v1/push/subscribe { endpoint }
export async function handleUnsubscribe(request, env) {
  const body = await readJson(request, 8192).catch(() => ({}));
  if (!body.endpoint) throw new HttpError(400, 'bad_subscription');
  await run(env, 'DELETE FROM push_subs WHERE endpoint = ?', body.endpoint);
  return noContent();
}

// POST /v1/push/test { endpoint }  → sends one notification now to that subscription (for the Settings "Send a test" button)
export async function handlePushTest(request, env) {
  const body = await readJson(request, 8192).catch(() => ({}));
  const sub = body.endpoint ? await first(env, 'SELECT * FROM push_subs WHERE endpoint = ?', body.endpoint) : null;
  if (!sub) throw new HttpError(404, 'not_subscribed');
  const r = await sendPush(env, sub, { title: 'SenLin reminder is on 🌱', body: 'This is how your daily 10-minute nudge will look.', url: '#/' });
  return json({ ok: r.ok, status: r.status });
}

// ---------- the daily send (Cloudflare cron, every 15 minutes) ----------
/** Local wall-clock minutes for a time zone, plus today's date there (YYYY-MM-DD). */
export function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now).map((p) => [p.type, p.value]));
  return { minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}
/** Which subscriptions are due: their local time is within [target, target+window) and nothing was sent today. */
export function dueNow(subs, now = new Date(), windowMin = 15) {
  return subs.filter((s) => {
    let loc; try { loc = localNow(s.tz || 'UTC', now); } catch { return false; }
    const target = (s.hour | 0) * 60 + (s.minute | 0);
    const diff = loc.minutes - target;
    if (diff < 0 || diff >= windowMin) return false;
    return !(s.last_sent && String(s.last_sent).startsWith(loc.date));
  });
}
export async function runDailyPush(env, now = new Date()) {
  const subs = await all(env, 'SELECT * FROM push_subs');
  const due = dueNow(subs, now);
  let sent = 0, gone = 0;
  for (const s of due) {
    const loc = localNow(s.tz || 'UTC', now);
    const r = await sendPush(env, s, { title: 'Your 10 minutes of Mandarin 🌱', body: 'One tree a day. Today’s lesson is ready.', url: '#/lesson' });
    if (r.status === 404 || r.status === 410) { await run(env, 'DELETE FROM push_subs WHERE endpoint = ?', s.endpoint); gone++; continue; }
    if (r.ok) { sent++; await run(env, 'UPDATE push_subs SET last_sent = ? WHERE endpoint = ?', `${loc.date}T${String(Math.floor(loc.minutes / 60)).padStart(2, '0')}:${String(loc.minutes % 60).padStart(2, '0')}`, s.endpoint); }
  }
  return { due: due.length, sent, gone };
}

// ---------- RFC 8291 encryption + RFC 8292 VAPID ----------
const te = new TextEncoder();
const concat = (...arrs) => { const n = arrs.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
/** Encrypt a payload for a subscription. Returns { body, salt, localPublic } (aes128gcm, rs 4096, one record). */
export async function encryptPayload(uaPublicB64, authB64, plaintext, opts = {}) {
  const uaPublic = b64urlDecode(uaPublicB64), authSecret = b64urlDecode(authB64);
  const local = opts.localKeyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, localPublic), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const padded = concat(typeof plaintext === 'string' ? te.encode(plaintext) : plaintext, new Uint8Array([2]));   // 0x02 = last record
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, padded));
  const header = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([localPublic.length]), localPublic);   // rs = 4096
  return { body: concat(header, cipher), salt, localPublic };
}
/** Decrypt (used by tests to prove the encryption is right). */
export async function decryptPayload(body, uaKeyPair, authB64) {
  const salt = body.slice(0, 16), idlen = body[20], localPublic = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeyPair.publicKey));
  const localKey = await crypto.subtle.importKey('raw', localPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: localKey }, uaKeyPair.privateKey, 256));
  const ikm = await hkdf(b64urlDecode(authB64), shared, concat(te.encode('WebPush: info\0'), uaPublic, localPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher));
  return new TextDecoder().decode(padded.slice(0, padded.lastIndexOf(2)));
}
/** VAPID Authorization header for an endpoint origin. */
export async function vapidAuthHeader(env, endpoint) {
  const k = await vapidKeys(env);
  const priv = await crypto.subtle.importKey('jwk', k.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64urlEncode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT(env) }));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, te.encode(`${header}.${payload}`)));   // raw r||s, as JWS wants
  return `vapid t=${header}.${payload}.${b64urlEncode(sig)}, k=${k.publicKey}`;
}
export async function sendPush(env, sub, message) {
  const { body } = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(message));
  const r = await upstreamFetch(env, sub.endpoint, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '43200', urgency: 'normal', authorization: await vapidAuthHeader(env, sub.endpoint) },
    body,
  });
  return { ok: r.ok, status: r.status };
}
