// CORS: allow-list from env.ALLOWED_ORIGINS (comma separated).
import { envFlag } from './util.js';

const DEFAULT_ORIGIN = 'https://forrest-jones.github.io';

export function allowedOrigins(env) {
  const list = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGIN)
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (envFlag(env, 'DEV')) list.push('http://localhost:8080');
  return list;
}

export function corsHeadersFor(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  const allowed = allowedOrigins(env);
  if (!allowed.includes(origin) && !allowed.includes('*')) return {};
  return {
    'access-control-allow-origin': allowed.includes('*') ? '*' : origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type, X-Senlin-Anon, X-Admin-Key',
    'access-control-expose-headers': 'Authorization, Content-Type, X-Senlin-Cache',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export function preflight(request, env) {
  const headers = corsHeadersFor(request, env);
  return new Response(null, { status: 204, headers });
}

/** Return a copy of `response` with CORS headers added. */
export function withCors(response, request, env) {
  const headers = corsHeadersFor(request, env);
  if (!Object.keys(headers).length) return response;
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}
