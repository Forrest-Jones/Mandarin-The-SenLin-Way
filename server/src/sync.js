// Progress sync with optimistic versioning + automatic backups.
import { HttpError, json, readJson, nowIso, utf8Bytes } from './util.js';
import { requireUser } from './auth.js';
import { first, all, run } from './db.js';

export const SYNC_MAX_BYTES = 2 * 1024 * 1024;
export const BACKUPS_KEPT = 10;

function parseBlob(row) {
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

// GET /v1/sync
export async function handleSyncGet(request, env) {
  const user = await requireUser(request, env);
  const row = await first(env, 'SELECT version, updated_at, data FROM sync_blobs WHERE user_id = ?', user.id);
  if (!row) throw new HttpError(404, 'none');
  return json({ version: row.version, updatedAt: row.updated_at, data: parseBlob(row) });
}

// PUT /v1/sync {version, data}
export async function handleSyncPut(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request, SYNC_MAX_BYTES + 64 * 1024);
  if (body.data === undefined || body.data === null || typeof body.data !== 'object') throw new HttpError(400, 'bad_data');
  const clientVersion = body.version == null ? 0 : Number(body.version);
  if (!Number.isInteger(clientVersion) || clientVersion < 0) throw new HttpError(400, 'bad_version');
  const data = JSON.stringify(body.data);
  if (utf8Bytes(data) > SYNC_MAX_BYTES) throw new HttpError(413, 'too_large', { maxBytes: SYNC_MAX_BYTES });

  const stored = await first(env, 'SELECT version, updated_at, data FROM sync_blobs WHERE user_id = ?', user.id);
  if (stored && stored.version !== clientVersion) {
    return json({ error: 'conflict', version: stored.version, updatedAt: stored.updated_at, data: parseBlob(stored) }, 409);
  }
  const version = (stored ? stored.version : 0) + 1;
  const updatedAt = nowIso();

  if (stored) {
    await run(env, 'INSERT INTO sync_backups (user_id, version, created_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, version) DO UPDATE SET data = excluded.data, created_at = excluded.created_at',
      user.id, stored.version, updatedAt, stored.data);
    await trimBackups(env, user.id);
  }
  await run(env, 'INSERT INTO sync_blobs (user_id, version, updated_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at, data = excluded.data',
    user.id, version, updatedAt, data);
  return json({ version, updatedAt });
}

async function trimBackups(env, userId) {
  const rows = await all(env, 'SELECT version FROM sync_backups WHERE user_id = ? ORDER BY version DESC', userId);
  if (rows.length <= BACKUPS_KEPT) return;
  const cutoff = rows[BACKUPS_KEPT - 1].version;
  await run(env, 'DELETE FROM sync_backups WHERE user_id = ? AND version < ?', userId, cutoff);
}

// GET /v1/sync/backups
export async function handleBackupsList(request, env) {
  const user = await requireUser(request, env);
  const rows = await all(env, 'SELECT version, created_at, LENGTH(data) AS bytes FROM sync_backups WHERE user_id = ? ORDER BY version DESC', user.id);
  return json({ backups: rows.map((r) => ({ version: r.version, createdAt: r.created_at, bytes: r.bytes })) });
}

// GET /v1/sync/backups/:version
export async function handleBackupGet(request, env, ctx, params) {
  const user = await requireUser(request, env);
  const version = Number(params.version);
  if (!Number.isInteger(version)) throw new HttpError(400, 'bad_version');
  const row = await first(env, 'SELECT version, created_at, data FROM sync_backups WHERE user_id = ? AND version = ?', user.id, version);
  if (!row) throw new HttpError(404, 'none');
  return json({ version: row.version, createdAt: row.created_at, data: parseBlob(row) });
}
