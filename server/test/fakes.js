// In-memory stand-ins for the Cloudflare bindings (D1, KV, ExecutionContext)
// plus helpers for building requests. Dependency-free (node:test only).

// ---------- FakeD1: a tiny SQL subset matching what src/ uses ----------
// Supported shapes (whitespace-insensitive):
//   INSERT INTO t (a, b) VALUES (?, ?) [ON CONFLICT(x[, y]) DO UPDATE SET a = excluded.a, b = b + excluded.b, c = ?]
//   SELECT * | cols | COUNT(*) AS n | COUNT(DISTINCT c) AS n | SUM(c) AS n | LENGTH(c) AS n
//          FROM t [WHERE c = ? AND c >= ? AND c IS NULL ...] [ORDER BY c [ASC|DESC]] [LIMIT n]
//   UPDATE t SET a = ?, b = ? WHERE ...
//   DELETE FROM t [WHERE ...]
export const SCHEMA = {
  users: { pk: ['id'], unique: [['email']], defaults: { plan: 'free', plan_expires_at: null, stripe_customer: null, last_seen: null } },
  sync_blobs: { pk: ['user_id'] },
  sync_backups: { pk: ['user_id', 'version'] },
  usage: { pk: ['user_id', 'day'], defaults: { messages: 0, input_tokens: 0, output_tokens: 0, tts_chars: 0, stt_seconds: 0 } },
  events: { pk: ['id'] },
  errors: { pk: ['id'] },
};

export class FakeD1 {
  constructor(schema = SCHEMA) {
    this.schema = schema;
    this.tables = Object.fromEntries(Object.keys(schema).map((t) => [t, []]));
    this.log = [];
  }
  prepare(sql) { return new FakeStmt(this, sql, []); }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; }
  async exec() { return { count: 0, duration: 0 }; }

  _table(name) {
    if (!this.tables[name]) throw new Error(`D1_ERROR: no such table: ${name}`);
    return this.tables[name];
  }

  execute(rawSql, params) {
    const sql = rawSql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
    this.log.push(sql);
    const p = { i: 0, params, next() { if (this.i >= params.length) throw new Error('D1_ERROR: not enough params'); return params[this.i++]; } };
    let m;
    if ((m = /^INSERT INTO (\w+) \(([^)]*)\) VALUES \(([^)]*)\)(?: ON CONFLICT ?\(([^)]*)\) DO UPDATE SET (.*))?$/i.exec(sql))) return this._insert(m, p);
    if ((m = /^SELECT (.*?) FROM (\w+)(?: WHERE (.*?))?(?: ORDER BY (\w+)( ASC| DESC)?)?(?: LIMIT (\d+))?$/i.exec(sql))) return this._select(m, p);
    if ((m = /^UPDATE (\w+) SET (.*?) WHERE (.*)$/i.exec(sql))) return this._update(m, p);
    if ((m = /^DELETE FROM (\w+)(?: WHERE (.*))?$/i.exec(sql))) return this._delete(m, p);
    throw new Error(`FakeD1: unsupported SQL: ${sql}`);
  }

  _insert(m, p) {
    const [, table, colList, valList, conflictCols, setList] = m;
    const rows = this._table(table);
    const def = this.schema[table] || {};
    const cols = colList.split(',').map((s) => s.trim());
    const vals = valList.split(',').map((s) => s.trim());
    const row = { ...(def.defaults || {}) };
    cols.forEach((c, i) => { row[c] = vals[i] === '?' ? p.next() : literal(vals[i]); });
    const keySets = [];
    if (conflictCols) keySets.push(conflictCols.split(',').map((s) => s.trim()));
    else { if (def.pk) keySets.push(def.pk); for (const u of def.unique || []) keySets.push(u); }
    for (const keys of keySets) {
      const existing = rows.find((r) => keys.every((k) => r[k] === row[k]));
      if (!existing) continue;
      if (!conflictCols) throw new Error(`D1_ERROR: UNIQUE constraint failed: ${table}.${keys.join(',')}`);
      for (const assign of splitTop(setList)) {
        const am = /^(\w+) = (.+)$/.exec(assign.trim());
        if (!am) throw new Error(`FakeD1: bad SET ${assign}`);
        const [, col, expr] = am;
        let em;
        if (expr === '?') existing[col] = p.next();
        else if ((em = /^excluded\.(\w+)$/.exec(expr))) existing[col] = row[em[1]];
        else if ((em = /^(\w+) \+ excluded\.(\w+)$/.exec(expr))) existing[col] = (existing[em[1]] || 0) + (row[em[2]] || 0);
        else if ((em = /^(\w+) \+ \?$/.exec(expr))) existing[col] = (existing[em[1]] || 0) + p.next();
        else throw new Error(`FakeD1: unsupported SET expr ${expr}`);
      }
      return { rows: [], changes: 1 };
    }
    rows.push(row);
    return { rows: [], changes: 1 };
  }

  _select(m, p) {
    const [, selectList, table, where, orderCol, orderDir, limit] = m;
    let rows = this._table(table).filter(whereFilter(where, p));
    if (orderCol) {
      const dir = (orderDir || '').trim().toUpperCase() === 'DESC' ? -1 : 1;
      rows = [...rows].sort((a, b) => (a[orderCol] < b[orderCol] ? -1 : a[orderCol] > b[orderCol] ? 1 : 0) * dir);
    }
    if (limit) rows = rows.slice(0, Number(limit));
    const items = splitTop(selectList).map((s) => s.trim());
    const isAgg = items.some((it) => /^(COUNT|SUM)\(/i.test(it));
    if (isAgg) {
      const out = {};
      for (const it of items) {
        let am;
        if ((am = /^COUNT\(\*\) AS (\w+)$/i.exec(it))) out[am[1]] = rows.length;
        else if ((am = /^COUNT\(DISTINCT (\w+)\) AS (\w+)$/i.exec(it))) out[am[2]] = new Set(rows.map((r) => r[am[1]]).filter((v) => v != null)).size;
        else if ((am = /^SUM\((\w+)\) AS (\w+)$/i.exec(it))) out[am[2]] = rows.length ? rows.reduce((s, r) => s + (Number(r[am[1]]) || 0), 0) : null;
        else throw new Error(`FakeD1: unsupported aggregate ${it}`);
      }
      return { rows: [out], changes: 0 };
    }
    const projected = rows.map((r) => {
      if (items.length === 1 && items[0] === '*') return { ...r };
      const out = {};
      for (const it of items) {
        let am;
        if ((am = /^LENGTH\((\w+)\) AS (\w+)$/i.exec(it))) out[am[2]] = r[am[1]] == null ? null : String(r[am[1]]).length;
        else if ((am = /^(\w+) AS (\w+)$/i.exec(it))) out[am[2]] = r[am[1]] ?? null;
        else if (/^\w+$/.test(it)) out[it] = r[it] ?? null;
        else throw new Error(`FakeD1: unsupported column ${it}`);
      }
      return out;
    });
    return { rows: projected, changes: 0 };
  }

  _update(m, p) {
    const [, table, setList, where] = m;
    const sets = splitTop(setList).map((s) => {
      const am = /^(\w+) = (\?|(\w+) \+ \?)$/.exec(s.trim());
      if (!am) throw new Error(`FakeD1: unsupported UPDATE SET ${s}`);
      return { col: am[1], add: am[3] || null, value: p.next() };
    });
    const filter = whereFilter(where, p);
    let changes = 0;
    for (const r of this._table(table)) {
      if (!filter(r)) continue;
      for (const s of sets) r[s.col] = s.add ? (r[s.add] || 0) + s.value : s.value;
      changes++;
    }
    return { rows: [], changes };
  }

  _delete(m, p) {
    const [, table, where] = m;
    const filter = whereFilter(where, p);
    const rows = this._table(table);
    const before = rows.length;
    this.tables[table] = rows.filter((r) => !filter(r));
    return { rows: [], changes: before - this.tables[table].length };
  }
}

function literal(s) {
  if (s === 'NULL') return null;
  if (/^'.*'$/.test(s)) return s.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  throw new Error(`FakeD1: unsupported literal ${s}`);
}

function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function whereFilter(where, p) {
  if (!where) return () => true;
  const conds = where.split(/ AND /i).map((c) => {
    let m;
    if ((m = /^(\w+) (=|!=|<>|>=|<=|>|<) \?$/.exec(c.trim()))) { const v = p.next(); return { col: m[1], op: m[2], v }; }
    if ((m = /^(\w+) IS NOT NULL$/i.exec(c.trim()))) return { col: m[1], op: 'notnull' };
    if ((m = /^(\w+) IS NULL$/i.exec(c.trim()))) return { col: m[1], op: 'null' };
    throw new Error(`FakeD1: unsupported WHERE ${c}`);
  });
  return (r) => conds.every(({ col, op, v }) => {
    const x = r[col];
    switch (op) {
      case '=': return x === v;
      case '!=': case '<>': return x !== v;
      case '>=': return x != null && x >= v;
      case '<=': return x != null && x <= v;
      case '>': return x != null && x > v;
      case '<': return x != null && x < v;
      case 'notnull': return x != null;
      case 'null': return x == null;
      default: return false;
    }
  });
}

class FakeStmt {
  constructor(db, sql, params) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new FakeStmt(this.db, this.sql, params); }
  async first(col) {
    const { rows } = this.db.execute(this.sql, this.params);
    const r = rows[0] ?? null;
    if (col === undefined) return r;
    return r ? r[col] ?? null : null;
  }
  async all() { const { rows } = this.db.execute(this.sql, this.params); return { results: rows, success: true, meta: {} }; }
  async run() { const { changes } = this.db.execute(this.sql, this.params); return { success: true, meta: { changes } }; }
  async raw() { const { rows } = this.db.execute(this.sql, this.params); return rows.map((r) => Object.values(r)); }
}

// ---------- FakeKV ----------
export class FakeKV {
  constructor() { this.map = new Map(); this.now = () => Date.now(); }
  _live(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expires && e.expires <= this.now()) { this.map.delete(key); return null; }
    return e;
  }
  async get(key, opts) {
    const type = typeof opts === 'string' ? opts : opts?.type || 'text';
    const e = this._live(key);
    if (!e) return null;
    if (type === 'arrayBuffer') return e.bytes ? e.bytes.slice(0) : new TextEncoder().encode(e.text).buffer;
    if (type === 'json') return e.text != null ? JSON.parse(e.text) : null;
    if (type === 'stream') return new Blob([e.bytes || e.text]).stream();
    return e.text != null ? e.text : new TextDecoder().decode(e.bytes);
  }
  async put(key, value, opts = {}) {
    const entry = { expires: opts.expirationTtl ? this.now() + opts.expirationTtl * 1000 : opts.expiration ? opts.expiration * 1000 : 0 };
    if (typeof value === 'string') entry.text = value;
    else if (value instanceof ArrayBuffer) entry.bytes = value.slice(0);
    else if (ArrayBuffer.isView(value)) entry.bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    else throw new Error('FakeKV: unsupported value');
    this.map.set(key, entry);
  }
  async delete(key) { this.map.delete(key); }
  async list({ prefix = '' } = {}) {
    return { keys: [...this.map.keys()].filter((k) => k.startsWith(prefix) && this._live(k)).map((name) => ({ name })), list_complete: true };
  }
}

// ---------- ExecutionContext ----------
export class FakeCtx {
  constructor() { this.promises = []; }
  waitUntil(p) { this.promises.push(Promise.resolve(p).catch(() => {})); }
  passThroughOnException() {}
  async done() { await Promise.all(this.promises); this.promises = []; }
}

// ---------- env + request helpers ----------
export function makeEnv(overrides = {}) {
  return {
    DB: new FakeD1(),
    CACHE: new FakeKV(),
    JWT_SECRET: 'test-secret-that-is-long-enough-123',
    DEV: '1',
    DEV_ECHO_CODE: '1',
    ALLOWED_ORIGINS: 'https://forrest-jones.github.io',
    ...overrides,
  };
}

export function req(path, { method = 'GET', body, headers = {}, token, raw } = {}) {
  const h = new Headers(headers);
  let payload = raw;
  if (body !== undefined && raw === undefined) {
    payload = typeof body === 'string' ? body : JSON.stringify(body);
    if (!h.has('content-type')) h.set('content-type', 'application/json');
  }
  if (token) h.set('authorization', `Bearer ${token}`);
  return new Request(`https://senlin-api.test${path}`, { method, headers: h, body: payload });
}

/** Run the sign-in flow against fakes and return {token, user}. */
export async function signIn(env, worker, email = 'learner@example.com') {
  const r1 = await worker.fetch(req('/v1/auth/request', { method: 'POST', body: { email } }), env, new FakeCtx());
  const { code } = await r1.json();
  const r2 = await worker.fetch(req('/v1/auth/verify', { method: 'POST', body: { email, code } }), env, new FakeCtx());
  if (r2.status !== 200) throw new Error(`sign-in failed: ${r2.status} ${await r2.text()}`);
  return r2.json();
}

/** Build a fake fetch that routes by URL substring. Records calls. */
export function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [needle, responder] of Object.entries(routes)) {
      if (String(url).includes(needle)) return typeof responder === 'function' ? responder(url, init, calls) : responder;
    }
    return new Response(JSON.stringify({ error: 'no fake route for ' + url }), { status: 599 });
  };
  fn.calls = calls;
  return fn;
}
