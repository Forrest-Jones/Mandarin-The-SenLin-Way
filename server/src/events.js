// Privacy-respecting analytics + client error reports + admin stats.
// Nothing about IP addresses or user agents is ever stored.
import { HttpError, json, noContent, readJson, nowIso, timingSafeEqual } from './util.js';
import { getUser } from './auth.js';
import { stmt, first, all } from './db.js';

export const EVENT_NAMES = new Set(['lesson_start', 'lesson_done', 'review', 'talk_start', 'talk_end', 'write_quiz', 'tone_drill', 'install', 'purchase', 'error', 'visit', 'say', 'sign_in', 'share', 'review_prompt']);
export const EVENTS_MAX_PER_REQUEST = 50;
const PROPS_MAX_CHARS = 2000;

function anonId(request) {
  const v = request.headers.get('x-senlin-anon') || '';
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

async function optionalUser(request, env) {
  if (!request.headers.get('authorization')) return null;
  const user = await getUser(request, env);
  if (!user) throw new HttpError(401, 'unauthorized');
  return user;
}

function cleanTs(ts) {
  const t = typeof ts === 'number' ? new Date(ts) : typeof ts === 'string' ? new Date(ts) : null;
  if (!t || !Number.isFinite(t.getTime())) return nowIso();
  const now = Date.now();
  if (t.getTime() > now + 5 * 60 * 1000) return nowIso();
  return t.toISOString();
}

// POST /v1/events {events:[{name, props?, ts}]}
export async function handleEvents(request, env) {
  const user = await optionalUser(request, env);
  const anon = anonId(request);
  if (!user && !anon) throw new HttpError(400, 'no_identity');
  const body = await readJson(request, 256 * 1024);
  if (!Array.isArray(body.events)) throw new HttpError(400, 'bad_events');
  if (body.events.length > EVENTS_MAX_PER_REQUEST) throw new HttpError(400, 'too_many_events', { max: EVENTS_MAX_PER_REQUEST });

  const actor = user ? user.id : anon;
  const rows = [];
  for (const ev of body.events) {
    if (!ev || typeof ev.name !== 'string' || !EVENT_NAMES.has(ev.name)) continue;
    let props = null;
    if (ev.props && typeof ev.props === 'object') {
      props = JSON.stringify(ev.props);
      if (props.length > PROPS_MAX_CHARS) props = props.slice(0, PROPS_MAX_CHARS);
    }
    rows.push([crypto.randomUUID(), user ? user.id : null, user ? null : anon, actor, ev.name, props, cleanTs(ev.ts)]);
  }
  if (rows.length) {
    const sql = 'INSERT INTO events (id, user_id, anon, actor, name, props, ts) VALUES (?, ?, ?, ?, ?, ?, ?)';
    await env.DB.batch(rows.map((r) => stmt(env, sql, ...r)));
  }
  return noContent();
}

// POST /v1/errors {message, stack?, url?, version?}
export async function handleErrors(request, env) {
  const user = await optionalUser(request, env);
  const body = await readJson(request, 64 * 1024);
  const message = typeof body.message === 'string' ? body.message.slice(0, 2000) : '';
  if (!message) throw new HttpError(400, 'bad_message');
  const stack = typeof body.stack === 'string' ? body.stack.slice(0, 8000) : null;
  const url = typeof body.url === 'string' ? body.url.slice(0, 500) : null;
  const version = typeof body.version === 'string' ? body.version.slice(0, 50) : null;
  await stmt(env, 'INSERT INTO errors (id, user_id, message, stack, url, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(), user ? user.id : null, message, stack, url, version, nowIso()).run();
  return noContent();
}

/** ADMIN_KEY header, or a signed-in OWNER_EMAIL account (see auth.applyOwner). */
export async function requireAdmin(request, env) {
  const key = request.headers.get('x-admin-key') || '';
  if (env.ADMIN_KEY && timingSafeEqual(key, env.ADMIN_KEY)) return;
  if (request.headers.get('authorization')) { const user = await getUser(request, env); if (user && user.owner) return; }
  throw new HttpError(401, 'unauthorized');
}

// GET /v1/admin/stats
export async function handleAdminStats(request, env) {
  await requireAdmin(request, env);
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  const d7 = iso(7 * 86400e3), d30 = iso(30 * 86400e3), h24 = iso(86400e3);
  const count = async (sql, ...p) => Number((await first(env, sql, ...p))?.n || 0);
  const [users, newUsers30, active7, active30, lessonsDone, lessonsDone30, aiMessages, aiMessages30, errors24, pro, newUsers7, pushSubs, lessons7] = await Promise.all([
    count('SELECT COUNT(*) AS n FROM users'),
    count('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', d30),
    count('SELECT COUNT(DISTINCT actor) AS n FROM events WHERE ts >= ?', d7),
    count('SELECT COUNT(DISTINCT actor) AS n FROM events WHERE ts >= ?', d30),
    count('SELECT COUNT(*) AS n FROM events WHERE name = ?', 'lesson_done'),
    count('SELECT COUNT(*) AS n FROM events WHERE name = ? AND ts >= ?', 'lesson_done', d30),
    count('SELECT SUM(messages) AS n FROM usage'),
    count('SELECT SUM(messages) AS n FROM usage WHERE day >= ?', d30.slice(0, 10)),
    count('SELECT COUNT(*) AS n FROM errors WHERE created_at >= ?', h24),
    all(env, 'SELECT * FROM users').then((rows) => rows.filter((u) => u.plan === 'pro' && (!u.plan_expires_at || Date.parse(u.plan_expires_at) > now)).length),
    count('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', d7),
    count('SELECT COUNT(*) AS n FROM push_subs'),
    count('SELECT COUNT(*) AS n FROM events WHERE name = ? AND ts >= ?', 'lesson_done', d7),
  ]);
  const recentEvents = await all(env, 'SELECT actor, name, ts FROM events WHERE ts >= ?', iso(45 * 86400e3));
  const retention = cohorts(recentEvents, now);
  const daily = dailySeries(recentEvents, now);
  const recentErrors = (await all(env, 'SELECT * FROM errors')).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10)
    .map((e) => ({ at: e.created_at, message: String(e.message || '').slice(0, 200), url: e.url, version: e.version }));
  return json({
    generatedAt: new Date(now).toISOString(),
    users: { total: users, new7d: newUsers7, new30d: newUsers30, pro },
    activeUsers: { last7d: active7, last30d: active30 },
    lessonsDone: { total: lessonsDone, last7d: lessons7, last30d: lessonsDone30 },
    aiMessages: { total: aiMessages, last30d: aiMessages30 },
    pushSubscriptions: pushSubs,
    errorsLast24h: errors24,
    retention,
    daily,
    recentErrors,
  });
}

/** The last `days` calendar days (UTC), oldest first: active learners and lessons done per day. */
export function dailySeries(rows, now = Date.now(), days = 14) {
  const today = Math.floor(now / 86400e3);
  const out = Array.from({ length: days }, (_, i) => ({ date: new Date((today - days + 1 + i) * 86400e3).toISOString().slice(0, 10), actives: new Set(), lessons: 0 }));
  for (const r of rows) {
    const t = Date.parse(r.ts); if (Number.isNaN(t)) continue;
    const idx = Math.floor(t / 86400e3) - (today - days + 1); if (idx < 0 || idx >= days) continue;
    if (r.actor) out[idx].actives.add(r.actor);
    if (r.name === 'lesson_done') out[idx].lessons++;
  }
  return out.map((d) => ({ date: d.date, actives: d.actives.size, lessons: d.lessons }));
}

/** Day-1 / day-7 return rates and the visit → lesson funnel, from the last 45 days of events (opt-in learners only).
 *  A learner's day 0 is the first day we saw them in the window; "day-1 retained" = active again the next calendar day,
 *  "day-7 retained" = active on day 7 (the Play Store's own definition).  Cohorts only count learners whose window has
 *  closed (day 0 at least 2 / 8 days ago), so a fresh install never reads as churned.                                  */
export function cohorts(rows, now = Date.now()) {
  const day = (ts) => Math.floor(Date.parse(ts) / 86400e3);
  const today = Math.floor(now / 86400e3);
  const byActor = new Map();
  for (const r of rows) {
    if (!r.actor || !r.ts || Number.isNaN(Date.parse(r.ts))) continue;
    let a = byActor.get(r.actor);
    if (!a) { a = { first: Infinity, days: new Set(), started: false, done: false }; byActor.set(r.actor, a); }
    const d = day(r.ts); a.days.add(d); if (d < a.first) a.first = d;
    if (r.name === 'lesson_start') a.started = true;
    if (r.name === 'lesson_done') a.done = true;
  }
  const since = today - 30;                                  // cohorts: first seen in the last 30 days
  const rate = (offset) => {
    let n = 0, back = 0;
    for (const a of byActor.values()) {
      if (a.first < since || a.first > today - offset - 1) continue;
      n++; if (a.days.has(a.first + offset)) back++;
    }
    return { learners: n, returned: back, pct: n ? Math.round((100 * back) / n) : null };
  };
  let visited = 0, started = 0, done = 0;
  for (const a of byActor.values()) { if (a.first < since) continue; visited++; if (a.started) started++; if (a.done) done++; }
  return { day1: rate(1), day7: rate(7), funnel: { visited, started, done } };
}
