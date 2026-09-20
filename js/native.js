/* Mandarin The SenLin Way — native bridge.
   One plain script for the website AND the Capacitor shell (native/). Exposes window.SenLinNative.
   Inside Capacitor the plugins come from window.Capacitor.Plugins; on the web every feature reports
   available:false and callers fall back to the browser APIs already used by app.js / tutor.js.
   Billing on the web talks to our server (/v1/entitlement) and the hosted checkout page.
   Nothing here throws at load time. */
(function () {
  'use strict';
  const cfg = () => window.SENLIN_CONFIG || {};
  const warn = (what, err) => { try { console.warn('[SenLinNative] ' + what, err && err.message || err || ''); } catch (e) { /* ignore */ } };

  let isNative = false, platform = 'web';
  try {
    const C = window.Capacitor;
    isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
    if (isNative && typeof C.getPlatform === 'function') platform = C.getPlatform(); // 'android' | 'ios'
  } catch (e) { warn('detect', e); }

  const plugin = name => { try { return (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; } catch (e) { return null; } };
  const TTS = plugin('TextToSpeech'), STT = plugin('SpeechRecognition'), LN = plugin('LocalNotifications');
  const HAP = plugin('Haptics'), SHARE = plugin('Share'), RC = plugin('Purchases');

  /** Signed-in session saved by the web app: localStorage 'senlin.auth' = {token, user}. */
  const auth = () => { try { const a = JSON.parse(localStorage.getItem('senlin.auth') || 'null'); return a && a.token ? a : null; } catch (e) { return null; } };

  /* ------------------------------------------------------------------ text to speech */
  const tts = {
    available: !!TTS,
    async speak(text, rate, lang) {
      if (!TTS || !text) return false;
      try { await TTS.speak({ text: String(text), lang: lang || 'zh-CN', rate: typeof rate === 'number' ? rate : 1, pitch: 1, volume: 1, category: 'ambient' }); return true; }
      catch (e) { warn('tts.speak', e); return false; }
    },
    async stop() { if (!TTS) return; try { await TTS.stop(); } catch (e) { warn('tts.stop', e); } }
  };

  /* ------------------------------------------------------------------ speech to text */
  const stt = {
    available: !!STT,
    listening: false,
    /** listen({lang, onResult(text, isFinal), onEnd(), onError(err)}) → true when started. */
    async listen(opts) {
      const o = opts || {}, lang = o.lang || 'zh-CN';
      const fail = err => { warn('stt.listen', err); stt.listening = false; try { o.onError && o.onError(err); } catch (e) { /* ignore */ } try { o.onEnd && o.onEnd(); } catch (e) { /* ignore */ } return false; };
      if (!STT) return fail(new Error('unavailable'));
      try {
        const av = await STT.available(); if (av && av.available === false) return fail(new Error('speech recognition unavailable on this device'));
        const perm = await STT.requestPermissions(); if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') return fail(new Error('not-allowed'));
        await STT.removeAllListeners();
        await STT.addListener('partialResults', d => { try { o.onResult && o.onResult((d && d.matches || [])[0] || '', false); } catch (e) { /* ignore */ } });
        await STT.addListener('listeningState', d => { if (d && d.status === 'stopped') { stt.listening = false; try { o.onEnd && o.onEnd(); } catch (e) { /* ignore */ } } });
        stt.listening = true;
        const res = await STT.start({ language: lang, maxResults: 3, partialResults: true, popup: false });
        if (res && res.matches && res.matches.length) { try { o.onResult && o.onResult(res.matches[0], true); } catch (e) { /* ignore */ } }
        return true;
      } catch (e) { return fail(e); }
    },
    async stop() { if (!STT) return; try { await STT.stop(); } catch (e) { warn('stt.stop', e); } stt.listening = false; }
  };

  /* ------------------------------------------------------------------ daily reminder */
  const NOTIFY_ID = 7001;
  const notify = {
    available: !!LN,
    async schedule(hour, minute, title, body) {
      if (!LN) return false;
      try {
        const perm = await LN.requestPermissions(); if (perm && perm.display && perm.display !== 'granted') return false;
        await LN.cancel({ notifications: [{ id: NOTIFY_ID }] });
        await LN.schedule({ notifications: [{
          id: NOTIFY_ID, title: title || 'Your 10 minutes of Mandarin', body: body || 'One tree a day. Today\'s lesson is ready.',
          schedule: { on: { hour: +hour || 8, minute: +minute || 0 }, allowWhileIdle: true }, smallIcon: 'ic_stat_senlin'
        }] });
        return true;
      } catch (e) { warn('notify.schedule', e); return false; }
    },
    async cancel() { if (!LN) return false; try { await LN.cancel({ notifications: [{ id: NOTIFY_ID }] }); return true; } catch (e) { warn('notify.cancel', e); return false; } }
  };

  /* ------------------------------------------------------------------ haptics + share */
  /** kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection' */
  async function haptic(kind) {
    const k = String(kind || 'light').toLowerCase();
    try {
      if (HAP) {
        if (k === 'success' || k === 'warning' || k === 'error') await HAP.notification({ type: k.toUpperCase() });
        else if (k === 'selection') await HAP.selectionStart().then(() => HAP.selectionChanged()).then(() => HAP.selectionEnd());
        else await HAP.impact({ style: k === 'heavy' ? 'HEAVY' : k === 'medium' ? 'MEDIUM' : 'LIGHT' });
        return true;
      }
      if (navigator.vibrate) return navigator.vibrate(k === 'error' ? [30, 40, 30] : k === 'heavy' ? 25 : 10);
    } catch (e) { warn('haptic', e); }
    return false;
  }

  async function share(text, url) {
    try {
      if (SHARE) { await SHARE.share({ title: 'Mandarin The SenLin Way', text: text || '', url: url || '', dialogTitle: 'Share' }); return true; }
      if (navigator.share) { await navigator.share({ title: 'Mandarin The SenLin Way', text: text || '', url: url || undefined }); return true; }
    } catch (e) { if (!/abort/i.test(String(e && e.name))) warn('share', e); }
    return false;
  }

  /* ------------------------------------------------------------------ billing */
  const FREE = { plan: 'free', active: false, source: 'none' };
  const fromCustomerInfo = info => {
    const active = info && info.entitlements && info.entitlements.active || {};
    const pro = active.pro;
    return pro ? { plan: 'pro', active: true, source: 'revenuecat', expiresAt: pro.expirationDate || null, productId: pro.productIdentifier || null, willRenew: !!pro.willRenew }
               : Object.assign({}, FREE, { source: 'revenuecat' });
  };
  const pkg = p => ({ id: p.identifier, type: p.packageType, productId: p.product && p.product.identifier, title: p.product && p.product.title, price: p.product && p.product.priceString, raw: p });

  const billing = {
    available: !!RC,
    userId: null,
    configured: false,
    async configure(userId) {
      billing.userId = userId || billing.userId;
      if (!RC) return false;
      const key = (cfg().revenuecat || {})[platform];
      if (!key) { warn('billing.configure', 'no RevenueCat key for ' + platform + ' in SENLIN_CONFIG.revenuecat'); return false; }
      try { await RC.configure({ apiKey: key, appUserID: billing.userId || undefined }); billing.configured = true; return true; }
      catch (e) { warn('billing.configure', e); return false; }
    },
    async offerings() {
      if (!RC) return [];
      try { const o = await RC.getOfferings(); return ((o && o.current && o.current.availablePackages) || []).map(pkg); }
      catch (e) { warn('billing.offerings', e); return []; }
    },
    async purchase(pkgId) {
      if (!RC) {                                   // web: hosted checkout (Stripe / RevenueCat Web Billing)
        const base = cfg().checkoutUrl; if (!base) return false;
        const a = auth(), id = billing.userId || (a && a.user && (a.user.id || a.user.email)) || '';
        const url = base + (base.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(id || 'anonymous');
        try { window.open(url, '_blank', 'noopener'); return true; } catch (e) { warn('billing.purchase', e); return false; }
      }
      try {
        const o = await RC.getOfferings();
        const list = (o && o.current && o.current.availablePackages) || [];
        const p = list.find(x => x.identifier === pkgId || (x.product && x.product.identifier === pkgId)) || list[0];
        if (!p) throw new Error('no package ' + pkgId);
        const r = await RC.purchasePackage({ aPackage: p });
        return fromCustomerInfo(r && r.customerInfo);
      } catch (e) { if (!(e && e.userCancelled)) warn('billing.purchase', e); return Object.assign({}, FREE, { cancelled: !!(e && e.userCancelled), error: String(e && e.message || e) }); }
    },
    async restore() {
      if (!RC) return billing.entitled();
      try { const r = await RC.restorePurchases(); return fromCustomerInfo(r && r.customerInfo); }
      catch (e) { warn('billing.restore', e); return FREE; }
    },
    async entitled() {
      if (RC) {
        try { const r = await RC.getCustomerInfo(); return fromCustomerInfo(r && r.customerInfo); }
        catch (e) { warn('billing.entitled', e); return FREE; }
      }
      const base = String(cfg().apiBase || '').replace(/\/+$/, ''), a = auth();
      if (!base || !a) return FREE;
      try {
        const res = await fetch(base + '/v1/entitlement', { headers: { Authorization: 'Bearer ' + a.token, Accept: 'application/json' } });
        if (!res.ok) return Object.assign({}, FREE, { source: 'server', error: res.status });
        const j = await res.json();
        return Object.assign({}, FREE, j, { active: (j.plan || 'free') !== 'free' || !!j.active, source: 'server' });
      } catch (e) { warn('billing.entitled', e); return Object.assign({}, FREE, { source: 'server', error: 'network' }); }
    }
  };

  window.SenLinNative = { isNative, platform, tts, stt, notify, haptic, share, billing };
})();
