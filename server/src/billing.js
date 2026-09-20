// RevenueCat + Stripe webhooks, entitlement lookup.
import { HttpError, json, timingSafeEqual, hex, envFlag } from './util.js';
import { getUser } from './auth.js';
import { getUserById, getUserByStripeCustomer, updateUser } from './db.js';
import { effectivePlan } from './limits.js';

const RC_PRO_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE']);
const RC_KEEP_EVENTS = new Set(['CANCELLATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED']);

const msToIso = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);

/** Pure mapping used by the webhook (exported for tests). Returns fields to update or null. */
export function revenuecatPlanChange(event) {
  if (!event || typeof event.type !== 'string') return null;
  const expires = msToIso(event.expiration_at_ms);
  if (RC_PRO_EVENTS.has(event.type)) return { plan: 'pro', plan_expires_at: expires };
  if (event.type === 'EXPIRATION') return { plan: 'free', plan_expires_at: expires };
  if (RC_KEEP_EVENTS.has(event.type)) return expires ? { plan_expires_at: expires } : {};
  return null; // TEST, TRANSFER, SUBSCRIBER_ALIAS, ... ignored
}

// POST /v1/webhooks/revenuecat
export async function handleRevenueCat(request, env) {
  const auth = request.headers.get('authorization') || '';
  const secret = env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || !(timingSafeEqual(auth, secret) || timingSafeEqual(auth, `Bearer ${secret}`))) throw new HttpError(401, 'unauthorized');
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, 'bad_json'); }
  const event = body?.event;
  const change = revenuecatPlanChange(event);
  if (!change) return json({ ok: true, ignored: true });
  const userId = event.app_user_id || event.original_app_user_id;
  const user = userId ? await getUserById(env, userId) : null;
  if (!user) return json({ ok: true, ignored: true, reason: 'unknown_user' });
  if (Object.keys(change).length) await updateUser(env, user.id, change);
  return json({ ok: true, plan: change.plan || user.plan });
}

// ---------- Stripe ----------
async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return hex(new Uint8Array(sig));
}

/** Verify a Stripe-Signature header per https://stripe.com/docs/webhooks/signatures */
export async function verifyStripeSignature(payload, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!header || !secret) return false;
  const parts = Object.create(null);
  const sigs = [];
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=').map((s) => s && s.trim());
    if (k === 't') parts.t = v;
    else if (k === 'v1' && v) sigs.push(v);
  }
  if (!parts.t || !sigs.length) return false;
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, `${parts.t}.${payload}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}

/** Build a Stripe-Signature header (used by tests and local tooling). */
export async function makeStripeSignature(payload, secret, now = Date.now()) {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${payload}`)}`;
}

const secToIso = (s) => (Number.isFinite(Number(s)) && Number(s) > 0 ? new Date(Number(s) * 1000).toISOString() : null);

/** Pure mapping for subscription status → user fields (exported for tests). */
export function stripeSubscriptionChange(type, sub) {
  const periodEnd = secToIso(sub.current_period_end || sub.items?.data?.[0]?.current_period_end);
  if (type === 'customer.subscription.deleted') return { plan: 'free', plan_expires_at: secToIso(sub.ended_at) || periodEnd };
  const status = sub.status;
  if (status === 'active' || status === 'trialing') {
    // keep access until the period ends when the customer cancelled at period end
    return { plan: 'pro', plan_expires_at: sub.cancel_at_period_end ? periodEnd : null };
  }
  if (status === 'past_due') return { plan: 'pro', plan_expires_at: periodEnd };
  return { plan: 'free', plan_expires_at: periodEnd };
}

// POST /v1/webhooks/stripe
export async function handleStripe(request, env) {
  const payload = await request.text();
  const ok = await verifyStripeSignature(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) throw new HttpError(401, 'bad_signature');
  let event;
  try { event = JSON.parse(payload); } catch { throw new HttpError(400, 'bad_json'); }
  const obj = event?.data?.object || {};
  const type = event?.type;

  if (type === 'checkout.session.completed') {
    const userId = obj.client_reference_id;
    const user = userId ? await getUserById(env, userId) : null;
    if (!user) return json({ ok: true, ignored: true, reason: 'unknown_user' });
    const customer = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null;
    await updateUser(env, user.id, { plan: 'pro', plan_expires_at: null, stripe_customer: customer });
    return json({ ok: true, plan: 'pro' });
  }
  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const customer = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null;
    const user = customer ? await getUserByStripeCustomer(env, customer) : null;
    if (!user) return json({ ok: true, ignored: true, reason: 'unknown_customer' });
    const change = stripeSubscriptionChange(type, obj);
    await updateUser(env, user.id, change);
    return json({ ok: true, plan: change.plan });
  }
  return json({ ok: true, ignored: true });
}

// GET /v1/entitlement  (works anonymously: returns the free entitlement)
export async function handleEntitlement(request, env) {
  const user = request.headers.get('authorization') ? await getUser(request, env) : null;
  if (request.headers.get('authorization') && !user) throw new HttpError(401, 'unauthorized');
  const plan = effectivePlan(user);
  const paywall = envFlag(env, 'PAYWALL');
  const premium = !paywall || plan === 'pro';
  return json({
    plan,
    expiresAt: user && plan === 'pro' ? user.plan_expires_at || null : null,
    features: { ai: true, hsk3plus: premium, dealDesk: premium },
  });
}
