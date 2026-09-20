// The D1 schema, embedded so the worker can create its own tables on first request.
// Keep in sync with ../schema.sql (that file is the same statements for manual `wrangler d1 execute`).
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, plan TEXT NOT NULL DEFAULT 'free', plan_expires_at TEXT, stripe_customer TEXT, created_at TEXT NOT NULL, last_seen TEXT);
CREATE TABLE IF NOT EXISTS sync_blobs (user_id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_backups (user_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user_id, version));
CREATE TABLE IF NOT EXISTS usage (user_id TEXT NOT NULL, day TEXT NOT NULL, messages INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, tts_chars INTEGER NOT NULL DEFAULT 0, stt_seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, user_id TEXT, anon TEXT, actor TEXT NOT NULL, name TEXT NOT NULL, props TEXT, ts TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS events_name ON events (name, ts);
CREATE INDEX IF NOT EXISTS events_actor ON events (actor, ts);
CREATE TABLE IF NOT EXISTS errors (id TEXT PRIMARY KEY, user_id TEXT, message TEXT NOT NULL, stack TEXT, url TEXT, version TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS errors_created ON errors (created_at);
CREATE INDEX IF NOT EXISTS users_created ON users (created_at);
`.trim();

let ensured = null;
/** Create the tables once per isolate (idempotent). No `wrangler d1 execute` step needed. */
export function ensureSchema(env) {
  if (!env || !env.DB || typeof env.DB.exec !== 'function') return Promise.resolve(false);
  if (!ensured) {
    ensured = env.DB.exec(SCHEMA_SQL).then(() => true).catch((e) => { ensured = null; console.error('schema', e && e.message); return false; });
  }
  return ensured;
}
