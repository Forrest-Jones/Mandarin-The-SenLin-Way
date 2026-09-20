// Passwordless email-code auth + bearer helpers.
import { HttpError, json, readJson, sha256Hex, randomDigits, normalizeEmail, nowIso, envFlag, upstreamFetch, timingSafeEqual } from './util.js';
import { signJwt, verifyJwt } from './jwt.js';
import { findOrCreateUser, getUserById, updateUser, getUsage } from './db.js';
import { effectivePlan, limitsFor } from './limits.js';

/** The token-signing secret: JWT_SECRET when set, otherwise one generated on first use and kept in KV. */
let generatedSecret = null;
export async function jwtSecret(env) {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (generatedSecret) return generatedSecret;
  const key = 'auth:jwt-secret';
  let s = env.CACHE ? await env.CACHE.get(key) : null;
  if (!s) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    s = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    if (env.CACHE) await env.CACHE.put(key, s);
  }
  generatedSecret = s;
  return s;
}

const CODE_TTL_SEC = 10 * 60;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 6;
const TOKEN_TTL_SEC = 90 * 24 * 3600;

const codeKey = (email) => `auth:code:${email}`;
const rateKey = (email) => `auth:rl:${email}`;
const attemptsKey = (email) => `auth:attempts:${email}`;

async function codeHash(env, email, code) {
  return sha256Hex(`${email}:${code}:${await jwtSecret(env)}`);
}

export function publicUser(user) {
  return { id: user.id, email: user.email, plan: effectivePlan(user) };
}

// POST /v1/auth/request {email}
export async function handleAuthRequest(request, env) {
  const body = await readJson(request, 4096);
  const email = normalizeEmail(body.email);
  if (!email) throw new HttpError(400, 'bad_email');

  const count = Number((await env.CACHE.get(rateKey(email))) || 0);
  if (count >= MAX_REQUESTS_PER_HOUR) throw new HttpError(429, 'limit', { limit: 'rate' });
  await env.CACHE.put(rateKey(email), String(count + 1), { expirationTtl: 3600 });

  const code = randomDigits(6);
  await env.CACHE.put(codeKey(email), await codeHash(env, email, code), { expirationTtl: CODE_TTL_SEC });
  await env.CACHE.delete(attemptsKey(email));

  const echo = envFlag(env, 'DEV_ECHO_CODE');
  if (env.RESEND_API_KEY) {
    await sendCodeEmail(env, email, code);
  } else if (!echo) {
    throw new HttpError(503, 'email_not_configured');
  }
  return json(echo ? { ok: true, code } : { ok: true });
}

async function sendCodeEmail(env, email, code) {
  const res = await upstreamFetch(env, 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'SenLin <onboarding@resend.dev>',
      to: [email],
      subject: 'Your SenLin sign-in code',
      text: `Your Mandarin The SenLin Way sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`,
      html: `<p>Your <b>Mandarin The SenLin Way</b> sign-in code is</p><p style="font-size:28px;letter-spacing:6px"><b>${code}</b></p><p>It expires in 10 minutes. If you did not request it, ignore this email.</p>`,
    }),
  });
  if (!res.ok) {
    console.error('resend failed', res.status, await res.text().catch(() => ''));
    throw new HttpError(502, 'email_failed');
  }
}

// POST /v1/auth/verify {email, code}
export async function handleAuthVerify(request, env) {
  const body = await readJson(request, 4096);
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').replace(/\s+/g, '');
  if (!email || !/^\d{6}$/.test(code)) throw new HttpError(401, 'bad_code');

  const attempts = Number((await env.CACHE.get(attemptsKey(email))) || 0);
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    await env.CACHE.delete(codeKey(email));
    throw new HttpError(429, 'limit', { limit: 'rate' });
  }
  await env.CACHE.put(attemptsKey(email), String(attempts + 1), { expirationTtl: CODE_TTL_SEC });

  const stored = await env.CACHE.get(codeKey(email));
  const expected = await codeHash(env, email, code);
  if (!stored || stored !== expected) throw new HttpError(401, 'bad_code');
  await env.CACHE.delete(codeKey(email));
  await env.CACHE.delete(attemptsKey(email));

  const user = await findOrCreateUser(env, email);
  await updateUser(env, user.id, { last_seen: nowIso() });
  const token = await signJwt({ sub: user.id, email: user.email }, await jwtSecret(env), { expiresInSec: TOKEN_TTL_SEC });
  return json({ token, user: publicUser(user) });
}

/** Bearer token → user row, or null when there is no/invalid token. */
export async function getUser(request, env) {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const payload = await verifyJwt(m[1].trim(), await jwtSecret(env));
  if (!payload || !payload.sub) return null;
  return getUserById(env, payload.sub);
}

/** Bearer token → user row, or throws 401. */
export async function requireUser(request, env) {
  const user = await getUser(request, env);
  if (!user) throw new HttpError(401, 'unauthorized');
  return user;
}

// GET /v1/me
export async function handleMe(request, env, ctx) {
  const user = await requireUser(request, env);
  const plan = effectivePlan(user);
  const usage = await getUsage(env, user.id);
  const touch = updateUser(env, user.id, { last_seen: nowIso() });
  if (ctx?.waitUntil) ctx.waitUntil(touch); else await touch;
  return json({
    user: { id: user.id, email: user.email, plan, createdAt: user.created_at },
    usage: {
      aiMessagesToday: usage.aiMessagesToday,
      aiTokensMonth: usage.aiTokensMonth,
      ttsCharsMonth: usage.ttsCharsMonth,
      sttSecondsMonth: usage.sttSecondsMonth,
    },
    limits: limitsFor(plan),
  });
}

// ---------- password sign-in (works with no email provider; hashes live in KV: pw:<email>) ----------
const PW_ITER = 100000;
const pwKey = (email) => `pw:${email}`;
const pwAttemptsKey = (email) => `pwtry:${email}`;
const MAX_PW_ATTEMPTS_PER_HOUR = 10;

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
  return new Uint8Array(bits);
}
const toB64 = (u8) => btoa(String.fromCharCode(...u8));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PW_ITER);
  return `pbkdf2$${PW_ITER}$${toB64(salt)}$${toB64(hash)}`;
}
export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2') return false;
  const got = await pbkdf2(password, fromB64(salt), Number(iter));
  return timingSafeEqual(toB64(got), hash);
}

// POST /v1/auth/password {email, password, create?}
//   create:true  → registers when the email has no password yet (also works for an account made by code sign-in)
//   otherwise    → signs in; 401 on a wrong password, 404 when there is no password for that email
export async function handleAuthPassword(request, env) {
  const body = await readJson(request, 4096);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!email) throw new HttpError(400, 'bad_email');
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'weak_password', { message: 'Use at least 8 characters' });

  const attempts = Number((await env.CACHE.get(pwAttemptsKey(email))) || 0);
  if (attempts >= MAX_PW_ATTEMPTS_PER_HOUR) throw new HttpError(429, 'limit', { limit: 'rate' });
  await env.CACHE.put(pwAttemptsKey(email), String(attempts + 1), { expirationTtl: 3600 });

  const stored = await env.CACHE.get(pwKey(email));
  if (!stored) {
    if (!body.create) throw new HttpError(404, 'no_password', { message: 'No password on this email yet. Choose "Create account".' });
    await env.CACHE.put(pwKey(email), await hashPassword(password));
  } else if (!(await verifyPassword(password, stored))) {
    throw new HttpError(401, 'bad_password');
  }
  await env.CACHE.delete(pwAttemptsKey(email));
  const user = await findOrCreateUser(env, email);
  await updateUser(env, user.id, { last_seen: nowIso() });
  const token = await signJwt({ sub: user.id, email: user.email }, await jwtSecret(env), { expiresInSec: TOKEN_TTL_SEC });
  return json({ token, user: publicUser(user), created: !stored });
}
