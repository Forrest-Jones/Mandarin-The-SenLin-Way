// HS256 JSON Web Tokens with WebCrypto only.
import { b64urlEncode, b64urlDecode, b64urlDecodeText } from './util.js';

const keyCache = new Map();

async function hmacKey(secret) {
  if (!secret || secret.length < 16) throw new Error('JWT_SECRET must be set (>= 16 chars)');
  let key = keyCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    keyCache.set(secret, key);
  }
  return key;
}

/**
 * Sign a payload. `expiresInSec` defaults to 90 days.
 * Adds iat/exp automatically.
 */
export async function signJwt(payload, secret, { expiresInSec = 90 * 24 * 3600, now = Date.now() } = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(now / 1000);
  const body = { ...payload, iat, exp: iat + expiresInSec };
  const signingInput = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(body))}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Returns the payload or null (bad signature, malformed, expired). */
export async function verifyJwt(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header;
  try {
    header = JSON.parse(b64urlDecodeText(h));
  } catch {
    return null;
  }
  if (!header || header.alg !== 'HS256') return null;
  let ok;
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      b64urlDecode(s),
      new TextEncoder().encode(`${h}.${p}`)
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecodeText(p));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  return payload;
}
