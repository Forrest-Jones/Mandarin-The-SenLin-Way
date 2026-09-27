// Account deletion (Google Play's account-deletion requirement, and section 9 of privacy.html).
import { json } from './util.js';
import { requireUser } from './auth.js';
import { stripeCall } from './billing.js';
import { all, run } from './db.js';

/** Cancels the customer's active Stripe subscriptions so a deleted account cannot keep being charged. Best effort. */
async function cancelStripe(env, user) {
  if (!user.stripe_customer || !env.STRIPE_SECRET_KEY) return { cancelled: 0 };
  try {
    const list = await stripeCall(env, 'subscriptions', { customer: user.stripe_customer, status: 'active', limit: 20 }, 'GET');
    let cancelled = 0;
    for (const sub of list?.data || []) { await stripeCall(env, `subscriptions/${sub.id}`, {}, 'DELETE'); cancelled++; }
    return { cancelled };
  } catch (e) {
    return { cancelled: 0, error: e?.message || 'stripe' };
  }
}

// DELETE /v1/me  → { ok, deleted: { syncBlobs, backups, usage, pushSubscriptions, events, errors }, stripe: { cancelled } }
// Removes the user row and everything keyed to it. Local progress on the device is untouched (the app keeps it).
export async function handleDeleteMe(request, env) {
  const user = await requireUser(request, env);
  const stripe = await cancelStripe(env, user);
  const deleted = {};
  for (const [name, table] of [['syncBlobs', 'sync_blobs'], ['backups', 'sync_backups'], ['usage', 'usage'], ['pushSubscriptions', 'push_subs'], ['events', 'events'], ['errors', 'errors']]) {
    deleted[name] = (await all(env, `SELECT user_id FROM ${table} WHERE user_id = ?`, user.id)).length;
    await run(env, `DELETE FROM ${table} WHERE user_id = ?`, user.id);
  }
  await run(env, 'DELETE FROM users WHERE id = ?', user.id);
  if (env.CACHE) await env.CACHE.delete(`pw:${user.email}`).catch(() => {});
  return json({ ok: true, deleted, stripe });
}
