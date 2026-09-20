// End-to-end check against the LIVE worker (run from CI or a laptop; the sandbox cannot reach workers.dev).
//   WORKER_URL=https://senlin-api.forrestjones2010.workers.dev node scripts/live-check.mjs
// Creates a throwaway password account, syncs, reads plans, creates a Stripe Checkout session (nothing is charged),
// subscribes a fake push endpoint and removes it again, then deletes nothing else (accounts are cheap rows).
const BASE = (process.env.WORKER_URL || 'https://senlin-api.forrestjones2010.workers.dev').replace(/\/+$/, '');
const ORIGIN = process.env.SITE_ORIGIN || 'https://forrest-jones.github.io';
let failures = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`); if (!cond) failures++; };
const j = async (path, init = {}) => {
  const r = await fetch(BASE + path, { ...init, headers: { origin: ORIGIN, 'content-type': 'application/json', ...(init.headers || {}) } });
  let body = null; try { body = await r.json(); } catch { /* no body */ }
  return { status: r.status, body, headers: r.headers };
};

const health = await j('/v1/health');
ok(health.status === 200 && health.body?.ok, 'health', JSON.stringify(health.body?.providers));
ok(health.body?.ready?.db && health.body?.ready?.cache && health.body?.ready?.auth, 'db, cache and auth ready');
ok(health.headers.get('access-control-allow-origin') === ORIGIN, 'CORS allows the site origin', health.headers.get('access-control-allow-origin') || 'none');

const email = `livecheck+${Date.now()}@example.com`, password = 'LiveCheck-' + Math.random().toString(36).slice(2, 10);
const created = await j('/v1/auth/password', { method: 'POST', body: JSON.stringify({ email, password, create: true }) });
ok(created.status === 200 && created.body?.token, 'password sign-up creates an account', String(created.status));
const auth = { authorization: `Bearer ${created.body?.token}` };
const again = await j('/v1/auth/password', { method: 'POST', body: JSON.stringify({ email, password }) });
ok(again.status === 200 && again.body?.created === false, 'password sign-in works');
const wrong = await j('/v1/auth/password', { method: 'POST', body: JSON.stringify({ email, password: 'not-the-password' }) });
ok(wrong.status === 401, 'wrong password rejected');

const me = await j('/v1/me', { headers: auth });
ok(me.status === 200 && me.body?.user?.email === email, '/v1/me', `plan ${me.body?.user?.plan}`);

const put = await j('/v1/sync', { method: 'PUT', headers: auth, body: JSON.stringify({ version: 0, data: { settings: { theme: 'auto' }, progress: { completed: { 1: '2026-09-21' } } } }) });
ok(put.status === 200 && put.body?.version === 1, 'sync push v1', String(put.status));
const get = await j('/v1/sync', { headers: auth });
ok(get.status === 200 && get.body?.data?.progress?.completed?.['1'] === '2026-09-21', 'sync pull returns the data');
const conflict = await j('/v1/sync', { method: 'PUT', headers: auth, body: JSON.stringify({ version: 0, data: {} }) });
ok(conflict.status === 409, 'stale version is a conflict');
const backups = await j('/v1/sync/backups', { headers: auth });
ok(backups.status === 200 && Array.isArray(backups.body), 'backups list');

const plans = await j('/v1/billing/plans');
ok(plans.status === 200 && plans.body?.plans?.length === 3 && plans.body.plans.every((p) => p.web), 'three plans purchasable on web');
const ent = await j('/v1/entitlement', { headers: auth });
ok(ent.status === 200 && ent.body?.plan === 'free', 'entitlement free', JSON.stringify(ent.body?.features));
const co = await j('/v1/billing/checkout', { method: 'POST', headers: auth, body: JSON.stringify({ plan: 'yearly' }) });
ok(co.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(co.body?.url || ''), 'Stripe Checkout session for yearly (7-day trial)', co.body?.url ? 'url ok' : JSON.stringify(co.body));
const portal = await j('/v1/billing/portal', { method: 'POST', headers: auth });
ok(portal.status === 404, 'portal refuses an account with no subscription');

const vapid = await j('/v1/push/vapid');
ok(vapid.status === 200 && (vapid.body?.publicKey || '').length > 80, 'VAPID public key');
const fakeSub = { endpoint: `https://updates.push.services.mozilla.com/wpush/v2/livecheck-${Date.now()}`, keys: { p256dh: 'BOrK' + 'A'.repeat(83), auth: 'AAAAAAAAAAAAAAAAAAAAAA' } };
const sub = await j('/v1/push/subscribe', { method: 'POST', headers: auth, body: JSON.stringify({ subscription: fakeSub, hour: 7, minute: 0, tz: 'America/New_York' }) });
ok(sub.status === 200, 'push subscribe', String(sub.status));
const unsub = await j('/v1/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: fakeSub.endpoint }) });
ok(unsub.status === 204, 'push unsubscribe');

const ai = await j('/v1/ai/chat', { method: 'POST', headers: auth, body: JSON.stringify({ system: 'Reply with exactly: 你好', messages: [{ role: 'user', content: 'ping' }], stream: false, maxTokens: 20 }) });
ok(ai.status === 200 && /你好/.test(ai.body?.text || ''), 'AI tutor answers through the server', ai.status === 200 ? (ai.body?.text || '').slice(0, 30) : JSON.stringify(ai.body));

const events = await j('/v1/events', { method: 'POST', headers: { 'x-senlin-anon': 'livecheck' }, body: JSON.stringify({ events: [{ name: 'visit', props: { route: 'livecheck' }, ts: new Date().toISOString() }] }) });
ok(events.status === 204, 'events accepted');

console.log(failures ? `\n${failures} check(s) failed` : '\nall live checks passed');
process.exit(failures ? 1 : 0);
