// Small dependency-free helpers shared by every handler.

export class HttpError extends Error {
  constructor(status, error, extra = {}) {
    super(typeof error === 'string' ? error : 'http_error');
    this.status = status;
    this.body = { error, ...extra };
  }
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function err(status, error, extra = {}) {
  return json({ error, ...extra }, status);
}

export function noContent() {
  return new Response(null, { status: 204 });
}

/** Parse a JSON body with a byte cap. Throws HttpError on bad input. */
export async function readJson(request, maxBytes = 1024 * 1024) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'too_large', { maxBytes });
  let text;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, 'bad_body');
  }
  if (utf8Bytes(text) > maxBytes) throw new HttpError(413, 'too_large', { maxBytes });
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    if (v === null || typeof v !== 'object') throw new Error('not an object');
    return v;
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export function utf8Bytes(str) {
  return new TextEncoder().encode(str).byteLength;
}

// ---------- time ----------
export const nowIso = () => new Date().toISOString();
export const todayUtc = (d = new Date()) => d.toISOString().slice(0, 10);          // YYYY-MM-DD
export const monthStartUtc = (d = new Date()) => d.toISOString().slice(0, 7) + '-01';
export function nextDayUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}
export function nextMonthUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

// ---------- crypto / encoding ----------
export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return hex(new Uint8Array(digest));
}

export function hex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlEncode(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  return base64ToBytes(b64);
}

export function b64urlDecodeText(str) {
  return new TextDecoder().decode(b64urlDecode(str));
}

/** Constant-time string comparison. */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export function randomDigits(n) {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  let s = '';
  for (const v of buf) s += String(v % 10);
  return s;
}

export function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/** Outbound fetch; tests inject env.FETCH. */
export function upstreamFetch(env, url, init) {
  const f = env.FETCH || globalThis.fetch;
  return f(url, init);
}

export function envFlag(env, name) {
  const v = env[name];
  return v === '1' || v === 'true' || v === true;
}

export function clampNumber(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
