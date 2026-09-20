/* Mandarin The SenLin Way — accounts, cloud sync, AI/voice proxy, telemetry
   Talks to the Cloudflare Worker in server/ (see server/API.md). Everything is optional:
   with SENLIN_CONFIG.apiBase empty the site behaves exactly as before. */
(function () {
  'use strict';
  const A = window.SenLinApp; if (!A) return;
  const { state, esc, toast } = A;
  const CFG = window.SENLIN_CONFIG || {};
  const BASE = (CFG.apiBase || '').replace(/\/$/, '');
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('senlin.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { if (v === null) localStorage.removeItem('senlin.' + k); else localStorage.setItem('senlin.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  let auth = store.get('auth', null);                       // { token, user:{id,email,plan}, plan, expiresAt }
  let sync = store.get('sync', { version: 0, updatedAt: null, lastPush: null, lastPull: null });
  const anon = store.get('anon', null) || (() => { const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); store.set('anon', id); return id; })();

  const available = () => !!BASE;
  const signedIn = () => !!(BASE && auth && auth.token);
  const token = () => (auth && auth.token) || '';
  const isPro = () => !CFG.paywall || !!(auth && (auth.plan === 'pro' || (auth.user && auth.user.plan === 'pro')) && (!auth.expiresAt || new Date(auth.expiresAt) > new Date()));

  async function api(path, opts = {}) {
    if (!BASE) throw new Error('No server configured');
    const headers = Object.assign({}, opts.headers || {});
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    if (token()) headers.Authorization = 'Bearer ' + token();
    const r = await fetch(BASE + path, Object.assign({}, opts, { headers }));
    if (r.status === 401 && token()) { signOut(false); throw new Error('Signed out — please sign in again'); }
    if (opts.raw) return r;
    const data = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) { const err = new Error((data && (data.message || data.error)) || ('HTTP ' + r.status)); err.status = r.status; err.data = data; throw err; }
    return data;
  }

  /* ------------------------------------------------------------ auth */
  async function requestCode(email) { return api('/v1/auth/request', { method: 'POST', json: { email } }); }
  async function verify(email, code) {
    const d = await api('/v1/auth/verify', { method: 'POST', json: { email, code } });
    auth = { token: d.token, user: d.user, plan: d.user.plan }; store.set('auth', auth);
    track('sign_in');
    await refreshEntitlement().catch(() => {});
    await pull().catch(() => {});
    if (window.SenLinNative && window.SenLinNative.billing) { try { window.SenLinNative.billing.configure(d.user.id); } catch (e) { /* ignore */ } }
    return auth;
  }
  function signOut(remote) { auth = null; store.set('auth', null); sync = { version: 0, updatedAt: null, lastPush: null, lastPull: null }; store.set('sync', sync); if (remote !== false) toast('Signed out. Your progress stays on this device.'); }
  async function refreshEntitlement() {
    if (!signedIn()) return null;
    const e = await api('/v1/entitlement');
    auth.plan = e.plan; auth.expiresAt = e.expiresAt || null; auth.features = e.features; store.set('auth', auth);
    return e;
  }

  /* ------------------------------------------------------------ sync (last-writer merge, automatic backups server-side) */
  let dirtyTimer = null, pushing = false;
  function dirty() { if (!signedIn()) return; clearTimeout(dirtyTimer); dirtyTimer = setTimeout(() => push().catch(() => {}), 4000); }
  function mergeInto(local, remote) {
    /* SRS: keep the entry with the more recent review (larger due/interval); progress.completed: union; counters: max; settings/cast/scenes: local wins, missing keys filled from remote */
    const out = Object.assign({}, remote, local);
    out.srs = Object.assign({}, remote.srs || {});
    Object.entries(local.srs || {}).forEach(([k, v]) => { const r = out.srs[k]; out.srs[k] = (!r || (v.due || 0) >= (r.due || 0)) ? v : r; });
    const rp = remote.progress || {}, lp = local.progress || {};
    out.progress = Object.assign({}, rp, lp, { completed: Object.assign({}, rp.completed || {}, lp.completed || {}) });
    ['reviews', 'quiz', 'said', 'tones', 'write'].forEach(k => { if (rp[k] && lp[k]) out.progress[k] = Object.fromEntries(Object.keys(Object.assign({}, rp[k], lp[k])).map(f => [f, Math.max(rp[k][f] || 0, lp[k][f] || 0)])); });
    out.scenes = Object.assign({}, remote.scenes || {}, local.scenes || {});
    out.cast = { actors: Object.assign({}, (remote.cast || {}).actors, (local.cast || {}).actors), sets: Object.assign({}, (remote.cast || {}).sets, (local.cast || {}).sets), rooms: Object.assign({}, (remote.cast || {}).rooms, (local.cast || {}).rooms), props: Object.assign({}, (remote.cast || {}).props, (local.cast || {}).props) };
    const words = {}; [...((remote.extra || {}).words || []), ...((local.extra || {}).words || [])].forEach(w => { words[w.w] = w; }); out.extra = { words: Object.values(words) };
    const talks = {}; [...(remote.talks || []), ...(local.talks || [])].forEach(t => { talks[t.at || JSON.stringify(t).slice(0, 80)] = t; }); out.talks = Object.values(talks).slice(-50);
    return out;
  }
  async function push() {
    if (!signedIn() || pushing) return; pushing = true;
    try {
      const body = { version: sync.version || 0, data: A.snapshot() };
      try {
        const r = await api('/v1/sync', { method: 'PUT', json: body });
        sync.version = r.version; sync.updatedAt = r.updatedAt; sync.lastPush = new Date().toISOString(); store.set('sync', sync);
      } catch (err) {
        if (err.status !== 409 || !err.data) throw err;
        const merged = mergeInto(A.snapshot(), err.data.data || {});
        sync.version = err.data.version;
        const r = await api('/v1/sync', { method: 'PUT', json: { version: sync.version, data: merged } });
        sync.version = r.version; sync.updatedAt = r.updatedAt; sync.lastPush = new Date().toISOString(); store.set('sync', sync);
        A.applyData(merged);
      }
    } finally { pushing = false; renderStatus(); }
  }
  async function pull() {
    if (!signedIn()) return;
    let r; try { r = await api('/v1/sync'); } catch (err) { if (err.status === 404) { await push(); return; } throw err; }
    if (r.version === sync.version && sync.lastPull) return;             // nothing new
    const merged = mergeInto(A.snapshot(), r.data || {});
    sync.version = r.version; sync.updatedAt = r.updatedAt; sync.lastPull = new Date().toISOString(); store.set('sync', sync);
    A.applyData(merged);
    await push();
  }
  async function backups() { return signedIn() ? api('/v1/sync/backups') : []; }
  async function restore(version) { const b = await api('/v1/sync/backups/' + version); A.applyData(b.data); sync.version = 0; await push(); }

  /* ------------------------------------------------------------ AI, voice */
  /** Stream a tutor reply through the server. Same signature as tutor.js complete(). */
  async function chat(system, messages, onText, signal) {
    const r = await api('/v1/ai/chat', { method: 'POST', json: { system, messages, stream: true }, raw: true, signal });
    if (!r.ok) { const d = await r.json().catch(() => ({})); const e = new Error(d.error === 'limit' ? `Daily tutor limit reached (${d.limit}). ${CFG.paywall && !isPro() ? 'Pro removes it.' : 'Try again tomorrow.'}` : (d.message || d.error || 'AI error')); e.code = d.error; throw e; }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '', text = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim(); if (payload === '[DONE]') break;
        try { const j = JSON.parse(payload); if (j.text) { text += j.text; onText(text); } } catch (e) { /* skip */ }
      }
    }
    return text;
  }
  async function tts(text, rate) { const r = await api('/v1/tts', { method: 'POST', json: { text, rate }, raw: true }); if (!r.ok) throw new Error('tts ' + r.status); return r.blob(); }
  async function stt(blob) { const r = await api('/v1/stt?lang=zh', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'audio/webm' }, raw: true }); if (!r.ok) throw new Error('stt ' + r.status); const d = await r.json(); return (d.text || '').trim(); }

  /* ------------------------------------------------------------ telemetry (opt-in, event names only) */
  const analyticsOn = () => CFG.analytics === 'on' || (CFG.analytics === 'opt-in' && state.settings.analytics === true);
  let queue = [];
  function track(name, props) {
    if (!BASE || !analyticsOn()) return;
    queue.push({ name, props: props || {}, ts: new Date().toISOString() });
    if (queue.length >= 20) flush();
  }
  function flush() {
    if (!queue.length || !BASE) return;
    const events = queue.splice(0, 50);
    const body = JSON.stringify({ events });
    const headers = { 'Content-Type': 'application/json', 'X-Senlin-Anon': anon }; if (token()) headers.Authorization = 'Bearer ' + token();
    fetch(BASE + '/v1/events', { method: 'POST', headers, body, keepalive: true }).catch(() => {});
  }
  setInterval(flush, 15000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  /* errors: Sentry when a DSN is configured, otherwise our own sink */
  let errorsSent = 0;
  function reportError(message, stack, extra) {
    if (errorsSent++ > 5) return;
    if (window.Sentry && CFG.sentryDsn) { try { window.Sentry.captureMessage(message); } catch (e) { /* ignore */ } return; }
    if (!BASE) return;
    fetch(BASE + '/v1/errors', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token() ? { Authorization: 'Bearer ' + token() } : {}), body: JSON.stringify(Object.assign({ message: String(message).slice(0, 500), stack: String(stack || '').slice(0, 2000), url: location.href, version: CFG.version }, extra || {})), keepalive: true }).catch(() => {});
  }
  window.addEventListener('error', e => reportError(e.message, e.error && e.error.stack, { line: e.lineno, file: e.filename }));
  window.addEventListener('unhandledrejection', e => reportError('unhandled: ' + (e.reason && (e.reason.message || e.reason)), e.reason && e.reason.stack));
  if (CFG.sentryDsn) {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@sentry/browser@9/build/bundles/bundle.min.js'; s.crossOrigin = 'anonymous';
    s.onload = () => { try { window.Sentry.init({ dsn: CFG.sentryDsn, release: 'senlin@' + CFG.version, sendDefaultPii: false, tracesSampleRate: 0 }); } catch (e) { /* ignore */ } };
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------ billing */
  async function buy() {
    const N = window.SenLinNative;
    if (N && N.isNative && N.billing) {
      try { const ok = await N.billing.purchase('pro'); if (ok) { await refreshEntitlement(); toast('Welcome to Pro 🌱'); A.navigate(); } } catch (e) { toast('Purchase did not complete'); }
      return;
    }
    if (!signedIn()) { toast('Sign in first so the purchase is attached to your account'); location.hash = '#/settings'; return; }
    if (!CFG.checkoutUrl) { toast('Purchases are not set up yet'); return; }
    track('purchase', { step: 'checkout' });
    window.open(CFG.checkoutUrl + (CFG.checkoutUrl.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(auth.user.id) + '&prefilled_email=' + encodeURIComponent(auth.user.email), '_blank');
  }

  /* ------------------------------------------------------------ settings UI */
  const fmt = iso => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
  function renderStatus() { const el = $('#sync-status'); if (el) el.textContent = signedIn() ? `Synced ${fmt(sync.lastPush || sync.lastPull)} · v${sync.version || 0}` : ''; }
  A.accountExtra = () => {
    if (!available()) return `<section class="card stack" id="account">
      <span class="eyebrow">Account</span><h2 class="h3">Connect your server</h2>
      <p class="muted small">Accounts, cross-device sync, the built-in tutor and the cloud voice need the SenLin API (the Cloudflare Worker in <code>server/</code>). Paste its URL once; it is remembered on this device.</p>
      <div class="row"><input class="input" id="api-url" type="url" placeholder="https://senlin-api.you.workers.dev" style="max-width:360px"><button class="btn btn-primary" id="api-save">Connect</button></div>
      <p class="small muted" id="api-note"></p>
    </section>`;
    if (!signedIn()) return `<section class="card card-accent stack" id="account">
      <span class="eyebrow">Account</span><h2 class="h3">Sign in to sync your forest</h2>
      <p class="muted small">Progress, reviews and scenes follow you across phone and laptop, with automatic backups. Sign-in is a 6-digit code by email. No password.</p>
      <div class="row"><input class="input" id="acct-email" type="email" placeholder="you@example.com" autocomplete="email" style="max-width:280px"><button class="btn btn-primary" id="acct-send">Send code</button></div>
      <div class="row" id="acct-code-row" hidden><input class="input" id="acct-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="6-digit code" style="max-width:160px"><button class="btn btn-primary" id="acct-verify">Sign in</button></div>
      <p class="small muted" id="acct-note"></p>
      <p class="small faint">By signing in you agree to the <a href="terms.html">terms</a> and <a href="privacy.html">privacy policy</a>.</p>
    </section>`;
    const u = auth.user || {};
    return `<section class="card card-accent stack" id="account">
      <div class="row between"><div><span class="eyebrow">Account</span><h2 class="h3">${esc(u.email || '')}</h2><p class="small muted"><b>${isPro() ? 'Pro' : 'Free'}</b>${auth.expiresAt ? ` · renews ${fmt(auth.expiresAt)}` : ''} · <span id="sync-status"></span></p></div>
        <div class="row"><button class="btn btn-sm" id="sync-now">Sync now</button><button class="btn btn-sm btn-ghost" id="acct-out">Sign out</button></div></div>
      <p class="small faint">Server: ${esc(BASE)}${store.get('apiBase', null) ? ' <button class="btn btn-sm btn-ghost" id="api-forget">Disconnect</button>' : ''}</p>
      ${CFG.paywall && !isPro() ? `<div class="row"><button class="btn btn-gold" id="acct-pro">Go Pro — the whole road to HSK 6</button></div>` : ''}
      <details><summary class="small">Backups</summary><div id="backups" class="small muted">loading…</div></details>
      ${CFG.analytics === 'opt-in' ? `<label class="row small"><input type="checkbox" id="analytics" ${state.settings.analytics ? 'checked' : ''}> Share anonymous usage counts (which pages and features are used; never your text, voice or email)</label>` : ''}
    </section>`;
  };
  A.accountExtraAfter = () => {
    if (!available()) {
      const b = $('#api-save'); if (!b) return;
      b.onclick = async () => {
        const url = $('#api-url').value.trim().replace(/\/$/, ''); const note = $('#api-note');
        if (!/^https?:\/\//.test(url)) { note.textContent = 'Enter the full URL, starting with https://'; return; }
        note.textContent = 'checking…';
        try { const r = await fetch(url + '/v1/health'); const h = await r.json(); if (!h.ok) throw new Error('not a SenLin API'); store.set('apiBase', url); note.textContent = 'Connected. Reloading…'; setTimeout(() => location.reload(), 600); }
        catch (e) { note.textContent = 'Could not reach a SenLin API at that address (' + (e.message || e) + ')'; }
      };
      return;
    }
    const send = $('#acct-send');
    if (send) {
      send.onclick = async () => {
        const email = $('#acct-email').value.trim(); const note = $('#acct-note'); if (!/^\S+@\S+\.\S+$/.test(email)) { note.textContent = 'Enter a valid email address'; return; }
        send.disabled = true; note.textContent = 'sending…';
        try { const r = await requestCode(email); $('#acct-code-row').hidden = false; note.textContent = r && r.code ? `Dev mode — your code is ${r.code}` : 'Check your inbox for a 6-digit code (valid 10 minutes)'; $('#acct-code').focus(); }
        catch (e) { note.textContent = e.message || 'Could not send the code'; }
        send.disabled = false;
      };
      $('#acct-verify').onclick = async () => {
        const note = $('#acct-note'); note.textContent = 'checking…';
        try { await verify($('#acct-email').value.trim(), $('#acct-code').value.trim()); toast('Signed in'); A.navigate(); }
        catch (e) { note.textContent = e.message || 'Wrong code'; }
      };
      return;
    }
    renderStatus();
    $('#sync-now').onclick = async () => { const b = $('#sync-now'); b.disabled = true; try { await pull(); await push(); toast('Synced'); } catch (e) { toast('Sync failed: ' + (e.message || e)); } b.disabled = false; renderStatus(); };
    $('#acct-out').onclick = () => { signOut(); A.navigate(); };
    const forget = $('#api-forget'); if (forget) forget.onclick = () => { signOut(false); store.set('apiBase', null); location.reload(); };
    const pro = $('#acct-pro'); if (pro) pro.onclick = buy;
    const an = $('#analytics'); if (an) an.onchange = () => { state.settings.analytics = an.checked; A.save(); };
    backups().then(list => { const el = $('#backups'); if (!el) return; el.innerHTML = list.length ? list.map(b => `<div class="row between"><span>v${b.version} · ${fmt(b.createdAt)} · ${Math.round(b.bytes / 1024)} KB</span><button class="btn btn-sm" data-restore="${b.version}">Restore</button></div>`).join('') : 'No backups yet — one is kept for every sync.'; el.querySelectorAll('[data-restore]').forEach(b => { b.onclick = async () => { if (confirm('Replace this device’s progress with backup v' + b.dataset.restore + '?')) { await restore(+b.dataset.restore); toast('Backup restored'); } }; }); }).catch(() => { const el = $('#backups'); if (el) el.textContent = 'Could not load backups.'; });
  };

  /* ------------------------------------------------------------ boot */
  window.SenLinCloud = { available, signedIn, token, isPro, api, requestCode, verify, signOut, push, pull, dirty, chat, tts, stt, track, flush, reportError, buy, refreshEntitlement, backups, restore, user: () => auth && auth.user };
  if (signedIn()) {
    refreshEntitlement().catch(() => {});
    pull().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull().catch(() => {}); });
    if (window.SenLinNative && window.SenLinNative.billing && auth.user) { try { window.SenLinNative.billing.configure(auth.user.id); } catch (e) { /* ignore */ } }
  }
  track('visit', { route: (location.hash.split('/')[1] || 'today') });
})();
