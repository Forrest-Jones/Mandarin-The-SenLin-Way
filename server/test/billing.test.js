import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, signIn, fakeFetch } from './fakes.js';
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

test('billing: plans catalogue, checkout session, portal', async () => {
  const calls = [];
  const FETCH = fakeFetch({
    'checkout/sessions': (url, init) => { calls.push(new URLSearchParams(init.body)); return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 }); },
    'billing_portal/sessions': (url, init) => { calls.push(new URLSearchParams(init.body)); return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session/x' }), { status: 200 }); },
  });
  const env = makeEnv({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_YEARLY: 'price_y', STRIPE_WEBHOOK_SECRET: 'whsec_x', FETCH });
  const { token, user } = await signIn(env, worker);

  const plans = await (await worker.fetch(req('/v1/billing/plans'), env, new FakeCtx())).json();
  assert.equal(plans.web, true);
  assert.deepEqual(plans.plans.map((p) => [p.id, p.price, p.web]), [['monthly', 11.99, true], ['yearly', 59.99, true], ['lifetime', 149.99, false]]);
  assert.equal(plans.plans[1].trialDays, 7);

  // needs sign-in
  assert.equal((await worker.fetch(req('/v1/billing/checkout', { method: 'POST', body: { plan: 'yearly' } }), env, new FakeCtx())).status, 401);
  // unknown plan / unconfigured price
  assert.equal((await worker.fetch(req('/v1/billing/checkout', { method: 'POST', token, body: { plan: 'weekly' } }), env, new FakeCtx())).status, 400);
  assert.equal((await worker.fetch(req('/v1/billing/checkout', { method: 'POST', token, body: { plan: 'lifetime' } }), env, new FakeCtx())).status, 503);

  const r = await worker.fetch(req('/v1/billing/checkout', { method: 'POST', token, body: { plan: 'yearly' } }), env, new FakeCtx());
  assert.equal(r.status, 200);
  assert.equal((await r.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  const form = calls[0];
  assert.equal(form.get('mode'), 'subscription');
  assert.equal(form.get('line_items[0][price]'), 'price_y');
  assert.equal(form.get('client_reference_id'), user.id);
  assert.equal(form.get('customer_email'), user.email);
  assert.equal(form.get('subscription_data[trial_period_days]'), '7');
  assert.match(form.get('success_url'), /#\/pro\/thanks$/);

  // no customer yet → portal 404
  assert.equal((await worker.fetch(req('/v1/billing/portal', { method: 'POST', token }), env, new FakeCtx())).status, 404);

  // the checkout webhook stores the customer; then the portal works and monthly uses the customer id
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: user.id, customer: 'cus_123' } } });
  const sig = await makeStripeSignature(payload, 'whsec_x');
  assert.equal((await worker.fetch(req('/v1/webhooks/stripe', { method: 'POST', raw: payload, headers: { 'stripe-signature': sig, 'content-type': 'application/json' } }), env, new FakeCtx())).status, 200);
  const portal = await worker.fetch(req('/v1/billing/portal', { method: 'POST', token }), env, new FakeCtx());
  assert.equal(portal.status, 200);
  assert.equal(calls[1].get('customer'), 'cus_123');
  await worker.fetch(req('/v1/billing/checkout', { method: 'POST', token, body: { plan: 'monthly' } }), env, new FakeCtx());
  assert.equal(calls[2].get('customer'), 'cus_123');
  assert.equal(calls[2].has('subscription_data[trial_period_days]'), false);
});

test('billing: one-shot stripe setup creates product, prices, webhook and portal, then checkout uses the stored ids', async () => {
  const created = [], hooks = [];
  const FETCH = fakeFetch({
    'products/search': () => new Response(JSON.stringify({ data: [] })),
    'https://api.stripe.com/v1/products': (url, init) => { created.push(['product', new URLSearchParams(init.body)]); return new Response(JSON.stringify({ id: 'prod_1' })); },
    'https://api.stripe.com/v1/prices?': () => new Response(JSON.stringify({ data: [{ id: 'price_m_existing', lookup_key: 'pro_monthly' }] })),
    'https://api.stripe.com/v1/prices': (url, init) => { const f = new URLSearchParams(init.body); created.push(['price', f]); return new Response(JSON.stringify({ id: 'price_' + f.get('lookup_key') })); },
    'webhook_endpoints?': () => new Response(JSON.stringify({ data: hooks })),
    'webhook_endpoints': (url, init) => { const f = new URLSearchParams(init.body); created.push(['webhook', f]); hooks.push({ id: 'we_1', url: f.get('url') }); return new Response(JSON.stringify({ id: 'we_1', secret: 'whsec_generated' })); },
    'billing_portal/configurations': (url, init) => { created.push(['portal', new URLSearchParams(init.body)]); return new Response(JSON.stringify({ id: 'bpc_1' })); },
    'billing_portal/sessions': (url, init) => { created.push(['portal_session', new URLSearchParams(init.body)]); return new Response(JSON.stringify({ url: 'https://billing.stripe.com/s' })); },
    'checkout/sessions': (url, init) => { created.push(['checkout', new URLSearchParams(init.body)]); return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/x' })); },
  });
  const env = makeEnv({ STRIPE_SECRET_KEY: 'sk_test_x', ADMIN_KEY: 'admin-1', FETCH });

  assert.equal((await worker.fetch(req('/v1/admin/stripe-setup'), env, new FakeCtx())).status, 401);
  const r = await worker.fetch(req('/v1/admin/stripe-setup?key=admin-1'), env, new FakeCtx());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.mode, 'test');
  assert.deepEqual(j.prices, { monthly: 'price_m_existing', yearly: 'price_pro_yearly', lifetime: 'price_pro_lifetime' });
  assert.equal(j.webhookUrl, 'https://senlin-api.test/v1/webhooks/stripe');
  assert.equal(j.webhookSecretStored, true);
  assert.deepEqual(j.created, ['product', 'price:yearly', 'price:lifetime', 'webhook', 'portal']);
  const yearly = created.find(([k, f]) => k === 'price' && f.get('lookup_key') === 'pro_yearly')[1];
  assert.equal(yearly.get('unit_amount'), '5999'); assert.equal(yearly.get('recurring[interval]'), 'year');
  const lifetime = created.find(([k, f]) => k === 'price' && f.get('lookup_key') === 'pro_lifetime')[1];
  assert.equal(lifetime.get('unit_amount'), '14999'); assert.equal(lifetime.has('recurring[interval]'), false);
  const hook = created.find(([k]) => k === 'webhook')[1];
  assert.deepEqual(hook.getAll('enabled_events[]'), ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted']);

  // idempotent: a second run creates nothing new
  const again = await (await worker.fetch(req('/v1/admin/stripe-setup', { headers: { 'x-admin-key': 'admin-1' } }), env, new FakeCtx())).json();
  assert.deepEqual(again.created, []);

  // plans now purchasable, checkout uses the stored price, webhook verifies with the stored secret
  const plans = await (await worker.fetch(req('/v1/billing/plans'), env, new FakeCtx())).json();
  assert.deepEqual(plans.plans.map((p) => p.web), [true, true, true]);
  const { token, user } = await signIn(env, worker);
  await worker.fetch(req('/v1/billing/checkout', { method: 'POST', token, body: { plan: 'lifetime' } }), env, new FakeCtx());
  const co = created.find(([k]) => k === 'checkout')[1];
  assert.equal(co.get('line_items[0][price]'), 'price_pro_lifetime'); assert.equal(co.get('mode'), 'payment');
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: user.id, customer: 'cus_9' } } });
  const sig = await makeStripeSignature(payload, 'whsec_generated');
  assert.equal((await worker.fetch(req('/v1/webhooks/stripe', { method: 'POST', raw: payload, headers: { 'stripe-signature': sig, 'content-type': 'application/json' } }), env, new FakeCtx())).status, 200);
  await worker.fetch(req('/v1/billing/portal', { method: 'POST', token }), env, new FakeCtx());
  assert.equal(created.find(([k]) => k === 'portal_session')[1].get('configuration'), 'bpc_1');
});
