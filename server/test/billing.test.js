import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, signIn } from './fakes.js';
import { verifyStripeSignature, makeStripeSignature, revenuecatPlanChange, stripeSubscriptionChange } from '../src/billing.js';

test('revenuecat webhook: auth + plan changes', async () => {
  const env = makeEnv({ REVENUECAT_WEBHOOK_SECRET: 'rc-secret' });
  const { token, user } = await signIn(env, worker);
  const post = (event, auth = 'rc-secret') => worker.fetch(req('/v1/webhooks/revenuecat', { method: 'POST', headers: { authorization: auth }, body: { api_version: '1.0', event } }), env, new FakeCtx());

  assert.equal((await post({ type: 'INITIAL_PURCHASE', app_user_id: user.id }, 'wrong')).status, 401);

  const exp = Date.now() + 30 * 86400e3;
  const r = await post({ type: 'INITIAL_PURCHASE', app_user_id: user.id, expiration_at_ms: exp });
  assert.equal(r.status, 200);
  let ent = await (await worker.fetch(req('/v1/entitlement', { token }), env, new FakeCtx())).json();
  assert.equal(ent.plan, 'pro');
  assert.equal(ent.expiresAt, new Date(exp).toISOString());
  assert.deepEqual(ent.features, { ai: true, hsk3plus: true, dealDesk: true });

  // cancellation keeps access until expiry
  await post({ type: 'CANCELLATION', app_user_id: user.id, expiration_at_ms: exp });
  ent = await (await worker.fetch(req('/v1/entitlement', { token }), env, new FakeCtx())).json();
  assert.equal(ent.plan, 'pro');

  // expiration -> free
  await post({ type: 'EXPIRATION', app_user_id: user.id, expiration_at_ms: Date.now() - 1000 });
  ent = await (await worker.fetch(req('/v1/entitlement', { token }), env, new FakeCtx())).json();
  assert.equal(ent.plan, 'free');

  const unknown = await post({ type: 'RENEWAL', app_user_id: 'nobody' });
  assert.equal((await unknown.json()).ignored, true);
  assert.equal(revenuecatPlanChange({ type: 'TEST' }), null);
});

test('entitlement: paywall flag gates premium features for free users', async () => {
  const env = makeEnv({ PAYWALL: '1' });
  const anon = await (await worker.fetch(req('/v1/entitlement'), env, new FakeCtx())).json();
  assert.deepEqual(anon, { plan: 'free', expiresAt: null, features: { ai: true, hsk3plus: false, dealDesk: false } });
  const open = await (await worker.fetch(req('/v1/entitlement'), makeEnv(), new FakeCtx())).json();
  assert.deepEqual(open.features, { ai: true, hsk3plus: true, dealDesk: true });
});

test('stripe: signature verify and webhook handling', async () => {
  const secret = 'whsec_test_123';
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { client_reference_id: 'U', customer: 'cus_1' } } });
  const sig = await makeStripeSignature(payload, secret);
  assert.equal(await verifyStripeSignature(payload, sig, secret), true);
  assert.equal(await verifyStripeSignature(payload + ' ', sig, secret), false);
  assert.equal(await verifyStripeSignature(payload, sig, 'other'), false);
  assert.equal(await verifyStripeSignature(payload, sig.replace(/v1=/, 'v0='), secret), false);
  const old = await makeStripeSignature(payload, secret, Date.now() - 10 * 60 * 1000);
  assert.equal(await verifyStripeSignature(payload, old, secret), false);

  const env = makeEnv({ STRIPE_WEBHOOK_SECRET: secret });
  const { token, user } = await signIn(env, worker);
  const send = async (event, goodSig = true) => {
    const body = JSON.stringify(event);
    const s = goodSig ? await makeStripeSignature(body, secret) : 't=1,v1=deadbeef';
    return worker.fetch(req('/v1/webhooks/stripe', { method: 'POST', raw: body, headers: { 'stripe-signature': s, 'content-type': 'application/json' } }), env, new FakeCtx());
  };
  assert.equal((await send({ type: 'checkout.session.completed', data: { object: { client_reference_id: user.id, customer: 'cus_1' } } }, false)).status, 401);
  const ok = await send({ type: 'checkout.session.completed', data: { object: { client_reference_id: user.id, customer: 'cus_1' } } });
  assert.equal(ok.status, 200);
  assert.equal(env.DB.tables.users[0].plan, 'pro');
  assert.equal(env.DB.tables.users[0].stripe_customer, 'cus_1');

  const periodEnd = Math.floor(Date.now() / 1000) + 86400;
  await send({ type: 'customer.subscription.updated', data: { object: { customer: 'cus_1', status: 'active', cancel_at_period_end: true, current_period_end: periodEnd } } });
  assert.equal(env.DB.tables.users[0].plan, 'pro');
  assert.equal(env.DB.tables.users[0].plan_expires_at, new Date(periodEnd * 1000).toISOString());

  await send({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1', status: 'canceled' } } });
  assert.equal(env.DB.tables.users[0].plan, 'free');
  const ent = await (await worker.fetch(req('/v1/entitlement', { token }), env, new FakeCtx())).json();
  assert.equal(ent.plan, 'free');

  assert.deepEqual(stripeSubscriptionChange('customer.subscription.updated', { status: 'trialing' }), { plan: 'pro', plan_expires_at: null });
  assert.equal(stripeSubscriptionChange('customer.subscription.updated', { status: 'unpaid' }).plan, 'free');
});
