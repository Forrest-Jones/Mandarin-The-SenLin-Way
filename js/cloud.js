/* Mandarin The SenLin Way — accounts, cloud sync, AI/voice proxy, telemetry
   Talks to the Cloudflare Worker in server/ (see server/API.md). Everything is optional:
   with SENLIN_CONFIG.apiBase empty the site behaves exactly as before. */
(function () {
  'use strict';
  const A = window.SenLinApp; if (!A) return;
  const { routes, state, esc, toast } = A;
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
  /** True only when this account actually holds Pro (the paywall switch is a separate question, see app.js `locked`). */
  const isPro = () => !!(auth && (auth.plan === 'pro' || (auth.user && auth.user.plan === 'pro')) && (!auth.expiresAt || new Date(auth.expiresAt) > new Date()));

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
  let healthCache = null;
  async function health() { if (healthCache) return healthCache; try { healthCache = await api('/v1/health'); } catch (e) { healthCache = { ok: false, providers: {} }; } return healthCache; }
  async function verify(email, code) { return finishSignIn(await api('/v1/auth/verify', { method: 'POST', json: { email, code } })); }
  async function password(email, pw, create) { return finishSignIn(await api('/v1/auth/password', { method: 'POST', json: { email, password: pw, create: !!create } })); }
  async function finishSignIn(d) {
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
  async function restoreBackup(version) { const b = await api('/v1/sync/backups/' + version); A.applyData(b.data); sync.version = 0; await push(); }

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

  /* ------------------------------------------------------------ billing: #/pro, Stripe Checkout (web), RevenueCat (apps) */
  let plansCache = null;
  async function plans() {
    if (plansCache) return plansCache;
    if (BASE) { try { const r = await api('/v1/billing/plans'); plansCache = r; return r; } catch (e) { /* fall back */ } }
    plansCache = { plans: (CFG.plans || []).map(p => Object.assign({}, p, { web: !!CFG.checkoutUrl })), web: !!CFG.checkoutUrl, portal: false, paywall: !!CFG.paywall };
    return plansCache;
  }
  const money = (n, cur) => (cur === 'USD' || !cur ? '$' : cur + ' ') + n.toFixed(2);
  const isNative = () => !!(window.SenLinNative && window.SenLinNative.isNative && window.SenLinNative.billing && window.SenLinNative.billing.available);
  /** Start a purchase of plan id ('monthly' | 'yearly' | 'lifetime'). */
  async function buy(planId) {
    const cat = await plans(); const plan = cat.plans.find(p => p.id === planId) || cat.plans.find(p => p.highlight) || cat.plans[0];
    if (!plan) { toast('No plans are configured yet'); return; }
    track('purchase', { step: 'start', plan: plan.id });
    const N = window.SenLinNative;
    if (isNative()) {
      try {
        if (!N.billing.configured) await N.billing.configure(auth && auth.user ? auth.user.id : null);
        const r = await N.billing.purchase(plan.rcPackage || plan.id);
        if (r && r.active) { await refreshEntitlement().catch(() => {}); track('purchase', { step: 'done', plan: plan.id }); location.hash = '#/pro/thanks'; }
        else if (!(r && r.cancelled)) toast('Purchase did not complete');
      } catch (e) { toast('Purchase did not complete'); }
      return;
    }
    if (!signedIn()) { toast('Sign in first so Pro is attached to your account'); try { sessionStorage.setItem('senlin.buy', plan.id); } catch (e) { /* ignore */ } location.hash = '#/settings'; return; }
    if (plan.web && BASE) {
      const b = document.querySelector(`[data-buy="${plan.id}"]`); if (b) { b.disabled = true; b.textContent = 'Opening secure checkout…'; }
      try { const r = await api('/v1/billing/checkout', { method: 'POST', json: { plan: plan.id } }); location.href = r.url; return; }
      catch (e) { toast(e.message || 'Checkout is unavailable right now'); if (b) { b.disabled = false; b.textContent = ctaText(plan); } return; }
    }
    if (CFG.checkoutUrl) { window.open(CFG.checkoutUrl + (CFG.checkoutUrl.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(auth.user.id) + '&prefilled_email=' + encodeURIComponent(auth.user.email), '_blank'); return; }
    toast('Purchases are not set up on this deployment yet');
  }
  async function portal() {
    if (isNative()) { toast('Manage the subscription in the store you bought it from'); return; }
    try { const r = await api('/v1/billing/portal', { method: 'POST' }); window.open(r.url, '_blank', 'noopener'); }
    catch (e) { toast(e.status === 404 ? 'No web subscription on this account' : (e.message || 'Could not open the billing portal')); }
  }
  async function restore() {
    if (isNative()) { const r = await window.SenLinNative.billing.restore(); if (r && r.active) { await refreshEntitlement().catch(() => {}); toast('Pro restored'); A.navigate(); } else toast('No purchase found for this store account'); return; }
    await refreshEntitlement().catch(() => {}); toast(isPro() ? 'Pro is active' : 'No purchase found — sign in with the email you bought with'); A.navigate();
  }
  const ctaText = p => p.trialDays ? `Start ${p.trialDays}-day free trial` : p.interval ? 'Choose ' + p.name.replace('Pro ', '') : 'Buy lifetime access';
  const FEATURES = ['The whole road: HSK 1 to HSK 6, 2,676 characters, 4,641 words, 1,444 sentences', 'Deal Desk: 12 units of cross-border private-equity and venture Mandarin', 'Built-in AI tutor, no API key, up to 400 turns a day', 'Cloud sync across phone and laptop with automatic backups', 'Cloud studio voice and pronunciation checking on every device, including iPhone', 'Everything offline once loaded, forever'];
  routes.pro = function (arg) {
    if (arg === 'thanks') return `<div class="stack-lg" style="max-width:640px"><section class="card card-gold stack">
      <span class="eyebrow">SenLin Pro</span><h1 class="h2">Welcome to the forest 🌱</h1>
      <p class="lead">Your plan is active${auth && auth.user ? ' on ' + esc(auth.user.email) : ''}. Every level, the Deal Desk, the tutor and sync are yours.</p>
      <div class="row"><a class="btn btn-primary" href="#/">Start today's lesson</a><a class="btn" href="#/settings">Account</a></div>
      <p class="small muted" id="pro-status"></p></section></div>`;
    return `<div class="stack-lg" style="max-width:900px">
      <div><span class="eyebrow">SenLin Pro</span><h1 class="h2">HSK 1 is free forever. Pro is the rest of the road.</h1>
        <p class="lead">Ten minutes a day from your first 你好 to HSK 6, with a tutor who talks back. One price, every device.</p></div>
      <div class="grid" id="plans" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))"><p class="muted">Loading plans…</p></div>
      <section class="card stack"><h2 class="h3">What Pro unlocks</h2><ul class="stack" style="gap:.4rem;padding-left:1.2rem">${FEATURES.map(f => `<li>${esc(f)}</li>`).join('')}</ul></section>
      <section class="card card-soft stack small">
        <h2 class="h3">Questions</h2>
        <p><b>Is there a free trial?</b> Yes: the yearly plan starts with 7 days free. Cancel before the trial ends and you pay nothing.</p>
        <p><b>Can I cancel?</b> Any time. Web subscriptions: Settings → Manage subscription. App purchases: in Google Play or the App Store. You keep Pro until the end of the period you paid for.</p>
        <p><b>Which devices?</b> All of them. Sign in with the same email on the website and in the apps and Pro follows you.</p>
        <p><b>Refunds?</b> Web purchases: full refund within 14 days of a first purchase, just email. Store purchases follow Google's and Apple's refund rules.</p>
        <p class="faint">Prices in US dollars; stores show local prices and tax. <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>. HSK-aligned; not affiliated with the HSK's owners.</p>
        <div class="row"><button class="btn btn-sm btn-ghost" id="restore">Restore purchase</button>${signedIn() ? `<button class="btn btn-sm btn-ghost" id="manage">Manage subscription</button>` : ''}</div>
      </section>
    </div>`;
  };
  routes.pro.after = async arg => {
    track('visit', { route: 'pro' });
    if (arg === 'thanks') { await refreshEntitlement().catch(() => {}); const el = $('#pro-status'); if (el) el.textContent = isPro() ? '' : 'Activating… if this does not update in a minute, tap Restore purchase on the plans page.'; return; }
    const cat = await plans(); const el = $('#plans'); if (!el) return;
    el.innerHTML = cat.plans.map(p => `<section class="card stack${p.highlight ? ' card-gold' : ''}" style="position:relative">
        ${p.highlight ? '<span class="chip chip-gold" style="position:absolute;top:-.8rem;left:1rem">Best value · save ' + (p.savePct || 50) + '%</span>' : p.launchOffer ? '<span class="chip chip-accent" style="position:absolute;top:-.8rem;left:1rem">Launch offer</span>' : ''}
        <h2 class="h3" style="margin-top:.4rem">${esc(p.name.replace('Pro ', ''))}</h2>
        <div><span style="font-size:2.2rem;font-weight:900">${p.perMonth ? money(p.perMonth, p.currency) : money(p.price, p.currency)}</span><span class="muted"> ${p.perMonth ? '/ month' : p.interval ? '/ ' + p.interval : 'once'}</span></div>
        <p class="small muted">${p.perMonth ? `${money(p.price, p.currency)} billed yearly` : p.interval ? 'Billed monthly, cancel any time' : 'One payment, yours for life'}${p.trialDays ? ` · <b>${p.trialDays}-day free trial</b>` : ''}</p>
        ${isPro() ? '<span class="chip">Your current plan family</span>' : `<button class="btn ${p.highlight ? 'btn-primary' : ''}" data-buy="${p.id}"${(p.web || isNative() || CFG.checkoutUrl) ? '' : ' disabled title="Not available yet"'}>${ctaText(p)}</button>`}
      </section>`).join('');
    el.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => buy(b.dataset.buy); });
    const r = $('#restore'); if (r) r.onclick = restore;
    const m = $('#manage'); if (m) m.onclick = portal;
    if (!cat.web && !isNative() && !CFG.checkoutUrl) { const n = document.createElement('p'); n.className = 'small muted'; n.textContent = 'Purchases open once the Stripe keys are set on the server (server/README.md → Billing).'; el.after(n); }
  };

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
      <p class="muted small">Progress, reviews, scenes and Pro follow you across phone and laptop, with automatic backups.</p>
      <div class="row"><input class="input" id="acct-email" type="email" placeholder="you@example.com" autocomplete="email" style="max-width:280px"></div>
      <div id="acct-pw" hidden class="stack" style="gap:.5rem">
        <div class="row"><input class="input" id="acct-password" type="password" placeholder="password (8+ characters)" autocomplete="current-password" style="max-width:280px"></div>
        <div class="row"><button class="btn btn-primary" id="acct-login">Sign in</button><button class="btn" id="acct-create">Create account</button></div>
      </div>
      <div id="acct-codeflow" hidden class="stack" style="gap:.5rem">
        <div class="row"><button class="btn btn-primary" id="acct-send">Email me a code</button><button class="btn btn-ghost btn-sm" id="acct-usepw">Use a password instead</button></div>
        <div class="row" id="acct-code-row" hidden><input class="input" id="acct-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="6-digit code" style="max-width:160px"><button class="btn btn-primary" id="acct-verify">Sign in</button></div>
      </div>
      <p class="small muted" id="acct-note">connecting…</p>
      <p class="small faint">By signing in you agree to the <a href="terms.html">terms</a> and <a href="privacy.html">privacy policy</a>.</p>
    </section>`;
    const u = auth.user || {};
    return `<section class="card card-accent stack" id="account">
      <div class="row between"><div><span class="eyebrow">Account</span><h2 class="h3">${esc(u.email || '')}</h2><p class="small muted"><b>${isPro() ? 'Pro' : 'Free'}</b>${auth.expiresAt ? ` · renews ${fmt(auth.expiresAt)}` : ''} · <span id="sync-status"></span></p></div>
        <div class="row"><button class="btn btn-sm" id="sync-now">Sync now</button><button class="btn btn-sm btn-ghost" id="acct-out">Sign out</button></div></div>
      <p class="small faint">Server: ${esc(BASE)}${store.get('apiBase', null) ? ' <button class="btn btn-sm btn-ghost" id="api-forget">Disconnect</button>' : ''}</p>
      <div class="row">${!isPro() ? `<a class="btn btn-gold" href="#/pro">Go Pro — from $5 a month</a>` : ''}${isPro() && !isNative() ? `<button class="btn btn-sm" id="acct-manage">Manage subscription</button>` : ''}<button class="btn btn-sm btn-ghost" id="acct-restore">Restore purchase</button></div>
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
      health().then(h => {
        const hasEmail = !!(h.providers && h.providers.email); const note = $('#acct-note'); if (!note) return;
        $('#acct-codeflow').hidden = !hasEmail; $('#acct-pw').hidden = hasEmail; note.textContent = hasEmail ? 'We email you a 6-digit code. No password needed.' : '';
      });
      $('#acct-usepw').onclick = () => { $('#acct-codeflow').hidden = true; $('#acct-pw').hidden = false; };
      const pwGo = async create => {
        const email = $('#acct-email').value.trim(); const pw = $('#acct-password').value; const note = $('#acct-note');
        if (!/^\S+@\S+\.\S+$/.test(email)) { note.textContent = 'Enter a valid email address'; return; }
        if (pw.length < 8) { note.textContent = 'Use a password of at least 8 characters'; return; }
        note.textContent = create ? 'creating…' : 'signing in…';
        try { const r = await password(email, pw, create); toast(r.created ? 'Account created' : 'Signed in'); A.navigate(); }
        catch (e) { note.textContent = e.status === 404 ? 'No account with a password for that email yet. Tap "Create account".' : e.status === 401 ? 'Wrong password.' : (e.message || 'Could not sign in'); }
      };
      $('#acct-login').onclick = () => pwGo(false);
      $('#acct-create').onclick = () => pwGo(true);
      $('#acct-password').addEventListener('keydown', e => { if (e.key === 'Enter') pwGo(false); });
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
    const mg = $('#acct-manage'); if (mg) mg.onclick = portal;
    const rs = $('#acct-restore'); if (rs) rs.onclick = restore;
    (() => { let want = null; try { want = sessionStorage.getItem('senlin.buy'); if (want) sessionStorage.removeItem('senlin.buy'); } catch (e) { /* ignore */ } if (want) buy(want); })();
    const an = $('#analytics'); if (an) an.onchange = () => { state.settings.analytics = an.checked; A.save(); };
    backups().then(list => { const el = $('#backups'); if (!el) return; el.innerHTML = list.length ? list.map(b => `<div class="row between"><span>v${b.version} · ${fmt(b.createdAt)} · ${Math.round(b.bytes / 1024)} KB</span><button class="btn btn-sm" data-restore="${b.version}">Restore</button></div>`).join('') : 'No backups yet — one is kept for every sync.'; el.querySelectorAll('[data-restore]').forEach(b => { b.onclick = async () => { if (confirm('Replace this device’s progress with backup v' + b.dataset.restore + '?')) { await restoreBackup(+b.dataset.restore); toast('Backup restored'); } }; }); }).catch(() => { const el = $('#backups'); if (el) el.textContent = 'Could not load backups.'; });
  };

  /* ------------------------------------------------------------ boot */
  window.SenLinCloud = { available, signedIn, token, isPro, api, requestCode, verify, password, health, signOut, push, pull, dirty, chat, tts, stt, track, flush, reportError, buy, portal, restorePurchase: restore, plans, refreshEntitlement, backups, restore: restoreBackup, user: () => auth && auth.user };
  if (/^#\/pro/.test(location.hash)) A.navigate();
  if (signedIn()) {
    refreshEntitlement().catch(() => {});
    pull().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull().catch(() => {}); });
    if (window.SenLinNative && window.SenLinNative.billing && auth.user) { try { window.SenLinNative.billing.configure(auth.user.id); } catch (e) { /* ignore */ } }
  }
  track('visit', { route: (location.hash.split('/')[1] || 'today') });
})();
