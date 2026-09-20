-- Mandarin The SenLin Way — API schema (Cloudflare D1 / SQLite)
-- Apply:  npm run db:migrate   (wrangler d1 execute senlin --file=schema.sql --remote)

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'free',     -- 'free' | 'pro'
  plan_expires_at TEXT,                              -- ISO time; NULL = no expiry
  stripe_customer TEXT,
  created_at      TEXT NOT NULL,
  last_seen       TEXT
);

-- one row per user: the latest synced snapshot of their localStorage state
CREATE TABLE IF NOT EXISTS sync_blobs (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  data       TEXT NOT NULL                          -- JSON, ≤ 2 MB
);

-- automatic backups: the last 10 versions per user
CREATE TABLE IF NOT EXISTS sync_backups (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  data       TEXT NOT NULL,
  PRIMARY KEY (user_id, version)
);

-- metering, one row per user per UTC day
CREATE TABLE IF NOT EXISTS usage (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,                      -- 'YYYY-MM-DD'
  messages      INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  tts_chars     INTEGER NOT NULL DEFAULT 0,
  stt_seconds   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- privacy-respecting analytics: event names only, no IP, no user agent
CREATE TABLE IF NOT EXISTS events (
  id      TEXT PRIMARY KEY,
  user_id TEXT,
  anon    TEXT,
  actor   TEXT NOT NULL,                            -- user_id or anon id (for daily-active counts)
  name    TEXT NOT NULL,
  props   TEXT,                                     -- small JSON
  ts      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_ts    ON events (ts);
CREATE INDEX IF NOT EXISTS events_name  ON events (name, ts);
CREATE INDEX IF NOT EXISTS events_actor ON events (actor, ts);

CREATE TABLE IF NOT EXISTS errors (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  message    TEXT NOT NULL,
  stack      TEXT,
  url        TEXT,
  version    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS errors_created ON errors (created_at);
CREATE INDEX IF NOT EXISTS users_created  ON users (created_at);
