// Thin helpers over the D1 binding (env.DB). Keep the SQL shapes simple:
// the test fakes implement a small subset (see test/fakes.js).
import { nowIso, todayUtc, monthStartUtc } from './util.js';

export const stmt = (env, sql, ...params) => env.DB.prepare(sql).bind(...params);
export async function first(env, sql, ...params) {
  return (await stmt(env, sql, ...params).first()) ?? null;
}
export async function all(env, sql, ...params) {
  const r = await stmt(env, sql, ...params).all();
  return r.results || [];
}
export async function run(env, sql, ...params) {
  return stmt(env, sql, ...params).run();
}

// ---------- users ----------
export const USER_COLS = 'id, email, plan, plan_expires_at, stripe_customer, created_at, last_seen';

export function getUserById(env, id) {
  return first(env, `SELECT ${USER_COLS} FROM users WHERE id = ?`, id);
}
export function getUserByEmail(env, email) {
  return first(env, `SELECT ${USER_COLS} FROM users WHERE email = ?`, email);
}
export function getUserByStripeCustomer(env, customer) {
  return first(env, `SELECT ${USER_COLS} FROM users WHERE stripe_customer = ?`, customer);
}

export async function findOrCreateUser(env, email) {
  const existing = await getUserByEmail(env, email);
  if (existing) return existing;
  const user = {
    id: crypto.randomUUID(),
    email,
    plan: 'free',
    plan_expires_at: null,
    stripe_customer: null,
    created_at: nowIso(),
    last_seen: nowIso(),
  };
  try {
    await run(
      env,
      'INSERT INTO users (id, email, plan, plan_expires_at, stripe_customer, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)',
      user.id, user.email, user.plan, user.plan_expires_at, user.stripe_customer, user.created_at, user.last_seen
    );
  } catch (e) {
    // Lost a race with a concurrent verify for the same email.
    const again = await getUserByEmail(env, email);
    if (again) return again;
    throw e;
  }
  return user;
}

const UPDATABLE = new Set(['plan', 'plan_expires_at', 'stripe_customer', 'last_seen']);
export async function updateUser(env, id, fields) {
  const keys = Object.keys(fields).filter((k) => UPDATABLE.has(k));
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  await run(env, `UPDATE users SET ${sets} WHERE id = ?`, ...keys.map((k) => fields[k]), id);
}

// ---------- usage ----------
/**
 * Add to today's usage row (upsert). Any field may be omitted.
 */
export async function addUsage(env, userId, { messages = 0, input = 0, output = 0, ttsChars = 0, sttSeconds = 0 } = {}, day = todayUtc()) {
  await run(
    env,
    'INSERT INTO usage (user_id, day, messages, input_tokens, output_tokens, tts_chars, stt_seconds) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(user_id, day) DO UPDATE SET messages = messages + excluded.messages, input_tokens = input_tokens + excluded.input_tokens, ' +
      'output_tokens = output_tokens + excluded.output_tokens, tts_chars = tts_chars + excluded.tts_chars, stt_seconds = stt_seconds + excluded.stt_seconds',
    userId, day, messages, input, output, ttsChars, sttSeconds
  );
}

export async function getUsage(env, userId, now = new Date()) {
  const today = await first(env, 'SELECT messages FROM usage WHERE user_id = ? AND day = ?', userId, todayUtc(now));
  const month = await first(
    env,
    'SELECT SUM(output_tokens) AS output_tokens, SUM(input_tokens) AS input_tokens, SUM(tts_chars) AS tts_chars, SUM(stt_seconds) AS stt_seconds FROM usage WHERE user_id = ? AND day >= ?',
    userId, monthStartUtc(now)
  );
  return {
    aiMessagesToday: Number(today?.messages || 0),
    aiTokensMonth: Number(month?.output_tokens || 0),
    aiInputTokensMonth: Number(month?.input_tokens || 0),
    ttsCharsMonth: Number(month?.tts_chars || 0),
    sttSecondsMonth: Number(month?.stt_seconds || 0),
  };
}
