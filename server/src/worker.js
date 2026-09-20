// Mandarin The SenLin Way — API worker (Cloudflare Workers, no dependencies).
// Routes live here; handlers are in the sibling modules and are all named exports
// so tests can call them directly with fake bindings.
import { HttpError, json, err } from './util.js';
import { preflight, withCors } from './cors.js';
import { handleAuthRequest, handleAuthVerify, handleMe, requireUser, getUser } from './auth.js';
import { handleSyncGet, handleSyncPut, handleBackupsList, handleBackupGet } from './sync.js';
import { handleAiChat } from './ai.js';
import { handleTts, ttsProvider } from './tts.js';
import { handleStt, sttProvider } from './stt.js';
import { handleEvents, handleErrors, handleAdminStats } from './events.js';
import { handleRevenueCat, handleStripe, handleEntitlement, handlePlans, handleCheckout, handlePortal, handleStripeSetup } from './billing.js';
import { ensureSchema } from './schema.js';

export const VERSION = '2026.09.20';

export { requireUser, getUser };
export * from './auth.js';
export * from './sync.js';
export * from './ai.js';
export * from './tts.js';
export * from './stt.js';
export * from './events.js';
export * from './billing.js';
export * from './jwt.js';

export function handleHealth(request, env) {
  const missing = [];
  if (!env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!ttsProvider(env)) missing.push(env.TTS_PROVIDER === 'google' ? 'GOOGLE_TTS_KEY' : 'AZURE_TTS_KEY + AZURE_TTS_REGION');
  if (!sttProvider(env)) missing.push(env.STT_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'DEEPGRAM_API_KEY');
  return json({
    ok: true,
    version: env.VERSION || VERSION,
    ready: { db: Boolean(env.DB), cache: Boolean(env.CACHE), auth: Boolean((env.JWT_SECRET || env.CACHE) && env.DB) },
    providers: {
      ai: Boolean(env.ANTHROPIC_API_KEY),
      tts: ttsProvider(env),
      stt: sttProvider(env),
      email: Boolean(env.RESEND_API_KEY),
    },
    missing,                       // secrets still to set in Cloudflare → Workers → senlin-api → Settings → Variables and Secrets
  });
}

// [method, pattern, handler]; ':name' segments become params.
export const ROUTES = [
  ['GET', '/v1/health', handleHealth],
  ['POST', '/v1/auth/request', handleAuthRequest],
  ['POST', '/v1/auth/verify', handleAuthVerify],
  ['GET', '/v1/me', handleMe],
  ['GET', '/v1/sync', handleSyncGet],
  ['PUT', '/v1/sync', handleSyncPut],
  ['GET', '/v1/sync/backups', handleBackupsList],
  ['GET', '/v1/sync/backups/:version', handleBackupGet],
  ['POST', '/v1/ai/chat', handleAiChat],
  ['POST', '/v1/tts', handleTts],
  ['POST', '/v1/stt', handleStt],
  ['POST', '/v1/events', handleEvents],
  ['POST', '/v1/errors', handleErrors],
  ['GET', '/v1/admin/stats', handleAdminStats],
  ['GET', '/v1/admin/stripe-setup', handleStripeSetup],
  ['POST', '/v1/admin/stripe-setup', handleStripeSetup],
  ['GET', '/v1/billing/plans', handlePlans],
  ['POST', '/v1/billing/checkout', handleCheckout],
  ['POST', '/v1/billing/portal', handlePortal],
  ['POST', '/v1/webhooks/revenuecat', handleRevenueCat],
  ['POST', '/v1/webhooks/stripe', handleStripe],
  ['GET', '/v1/entitlement', handleEntitlement],
];

export function matchRoute(method, pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const segs = path.split('/');
  let pathMatched = false;
  for (const [m, pattern, handler] of ROUTES) {
    const psegs = pattern.split('/');
    if (psegs.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < psegs.length; i++) {
      if (psegs[i].startsWith(':')) params[psegs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (psegs[i] !== segs[i]) { ok = false; break; }
    }
    if (!ok) continue;
    pathMatched = true;
    if (m === method) return { handler, params };
  }
  return pathMatched ? { methodNotAllowed: true } : null;
}

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return preflight(request, env);
  const match = matchRoute(request.method, url.pathname);
  if (!match) return err(404, 'not_found');
  if (match.methodNotAllowed) return err(405, 'method_not_allowed');
  try {
    if (match.handler !== handleHealth) await ensureSchema(env);
    return await match.handler(request, env, ctx, match.params);
  } catch (e) {
    if (e instanceof HttpError) return json(e.body, e.status);
    console.error('unhandled', e && e.stack ? e.stack : e);
    return err(500, 'internal');
  }
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env, ctx);
    return withCors(response, request, env);
  },
};
