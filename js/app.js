/* Mandarin The SenLin Way — the app (no dependencies) */
(function () {
  'use strict';
  const S = window.SenLin;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const app = $('#app');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------------------------------------------ storage */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('senlin.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('senlin.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const state = {
    settings: Object.assign({ startDate: S.CONFIG.startDate, charsPerDay: 3, rate: 0.85, voice: '', showPinyin: true, theme: 'auto', business: true }, store.get('settings', {})),
    cast: store.get('cast', { actors: {}, sets: {}, rooms: {}, props: {} }),
    srs: store.get('srs', {}),
    scenes: store.get('scenes', {}),
    progress: Object.assign({ completed: {}, reviews: { total: 0, good: 0 }, quiz: { total: 0, right: 0 } }, store.get('progress', {})),
    extra: store.get('extra', { words: [] }),
    talks: store.get('talks', [])
  };
  const save = () => { store.set('settings', state.settings); store.set('cast', state.cast); store.set('srs', state.srs); store.set('scenes', state.scenes); store.set('progress', state.progress); store.set('extra', state.extra); store.set('talks', state.talks); if (window.SenLinCloud) window.SenLinCloud.dirty(); };
  const applyTheme = () => { if (state.settings.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', state.settings.theme); };
  applyTheme();

  let DAYS = S.buildSchedule({ charsPerDay: state.settings.charsPerDay });
  const rebuild = () => { DAYS = S.buildSchedule({ charsPerDay: state.settings.charsPerDay }); };
  const todayDay = () => S.dayNumber(new Date(), state.settings.startDate);
  const dayInfo = d => DAYS[Math.min(d, DAYS.length) - 1];

  /* ------------------------------------------------------------ speech
     Voice order: recorded audio (audio/index.json, a licensed studio voice) → the native app's voice →
     the device's Web Speech voice → the cloud voice (our server, when signed in). No unofficial endpoints. */
  const CFG = window.SENLIN_CONFIG || {};
  const tts = {
    voices: [],
    load() { this.voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(v => /^zh([-_]|$)/i.test(v.lang) || /chinese|mandarin|putonghua/i.test(v.name)); },
    best() {
      if (state.settings.voice) { const v = this.voices.find(v => v.name === state.settings.voice); if (v) return v; }
      const pref = ['Tingting', 'Xiaoxiao', 'Yunxi', 'Google 普通话', 'Huihui', 'Yaoyao', 'Kangkang', 'Lili', 'zh-CN'];
      for (const p of pref) { const v = this.voices.find(v => (v.name + ' ' + v.lang).includes(p)); if (v) return v; }
      return this.voices.find(v => /zh[-_]CN/i.test(v.lang)) || this.voices[0];
    },
    audio: null, playing: false, index: null, hashes: new Map(),
    /* recorded audio: audio/<sha256(text).slice(0,16)>.mp3, listed in audio/index.json (see tools/audio.js) */
    async loadIndex() {
      if (this.index !== null) return this.index;
      this.index = false;
      try { const r = await fetch((CFG.audioBase || 'audio/') + 'index.json'); if (r.ok) { const j = await r.json(); if (j && j.items) this.index = j; } } catch (e) { /* no recorded audio */ }
      return this.index;
    },
    async hash(text) {
      if (this.hashes.has(text)) return this.hashes.get(text);
      if (!(window.crypto && crypto.subtle)) return null;
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const id = Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
      this.hashes.set(text, id); return id;
    },
    async recordedUrl(text, rate) {
      const idx = await this.loadIndex(); if (!idx) return null;
      const id = await this.hash(text); const it = id && idx.items[id]; if (!it) return null;
      return (CFG.audioBase || 'audio/') + id + (rate < 0.75 && it.slow ? '-slow' : '') + '.mp3';
    },
    playUrl(url, rate) {
      return new Promise((resolve, reject) => {
        const a = new Audio(url); this.audio = a; this.playing = true;
        if (rate && rate < 0.75 && !/-slow\.mp3$/.test(url)) a.playbackRate = Math.max(0.6, rate);
        a.onended = () => { this.playing = false; resolve(true); };
        a.onerror = () => { this.playing = false; reject(new Error('audio failed')); };
        a.play().catch(err => { this.playing = false; reject(err); });
      });
    },
    hasDeviceVoice() { if (!window.speechSynthesis) return false; if (!this.voices.length) this.load(); return !!this.best(); },
    speakDevice(text, rate) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = rate;
      const v = this.best(); if (v) u.voice = v;
      speechSynthesis.speak(u);
    },
    async speakCloud(text, rate) {
      const C = window.SenLinCloud; if (!C || !C.signedIn()) return false;
      try { const blob = await C.tts(text, rate); await this.playUrl(URL.createObjectURL(blob)); return true; } catch (e) { return false; }
    },
    stop() { try { if (this.audio) this.audio.pause(); } catch (e) { /* ignore */ } this.playing = false; if (window.speechSynthesis) speechSynthesis.cancel(); const N = window.SenLinNative; if (N && N.isNative) { try { N.tts.stop(); } catch (e) { /* ignore */ } } },
    async speak(text, rate) {
      rate = rate || state.settings.rate; const src = state.settings.voiceSource || 'auto';
      this.stop();
      if (src === 'auto' || src === 'recorded') { const url = await this.recordedUrl(text, rate); if (url) { try { await this.playUrl(url, rate); return; } catch (e) { /* fall through */ } } }
      const N = window.SenLinNative;
      if (src !== 'cloud' && N && N.isNative && N.tts.available) { try { await N.tts.speak(text, rate); return; } catch (e) { /* fall through */ } }
      if ((src === 'auto' || src === 'device' || src === 'recorded') && this.hasDeviceVoice()) return this.speakDevice(text, rate);
      if (await this.speakCloud(text, rate)) return;
      if (this.hasDeviceVoice()) return this.speakDevice(text, rate);
      const C = window.SenLinCloud;
      toast(C && C.available() && !C.signedIn() ? 'No Chinese voice on this device. Sign in (Settings) for the cloud voice, or open the site in Chrome.' : 'No Chinese voice on this device. Open the site in Chrome, or add a Chinese voice in your system settings.');
    },
    get speaking() { return this.playing || (!!window.speechSynthesis && speechSynthesis.speaking); }
  };
  if (window.speechSynthesis) { tts.load(); speechSynthesis.onvoiceschanged = () => tts.load(); }
  const playBtn = (text, opts = {}) => `<button class="btn btn-icon${opts.cls ? ' ' + opts.cls : ''}" data-say="${esc(text)}"${opts.rate ? ` data-rate="${opts.rate}"` : ''} title="Listen" aria-label="Listen">${opts.slow ? '🐢' : '🔊'}</button>`;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]'); if (b) tts.speak(b.dataset.say, b.dataset.rate ? parseFloat(b.dataset.rate) : undefined);
  });

  /* ---- "Say it": speech recognition scores what you said against the target.
     Engines, in order: the native app (iOS/Android), the browser (Chrome, Edge, Android), the cloud (our server, signed in). */
  const ASR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hanOnly = t => Array.from(t).filter(c => /\p{Script=Han}/u.test(c));
  function matchScore(target, said) {
    const t = hanOnly(target), sd = hanOnly(said);
    if (!t.length) return 0;
    /* longest common subsequence, character level */
    const m = t.length, n = sd.length, dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = t[i - 1] === sd[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    return dp[m][n] / m;
  }
  const canRecord = () => !!(navigator.mediaDevices && window.MediaRecorder);
  /** Which recogniser would run now: 'native' | 'browser' | 'cloud' | null */
  function listenEngine() {
    const N = window.SenLinNative, C = window.SenLinCloud;
    if (N && N.isNative && N.stt.available) return 'native';
    if (ASR) return 'browser';
    if (C && C.signedIn() && canRecord()) return 'cloud';
    return null;
  }
  /** Listen once for Mandarin. Calls onResult(alternatives[]) or onError(message); always onEnd(). Returns a stop() function. */
  function listenOnce({ onResult, onError, onEnd, seconds = 6 }) {
    const eng = listenEngine();
    const done = () => { if (onEnd) onEnd(); };
    if (eng === 'native') {
      const N = window.SenLinNative;
      N.stt.listen({ lang: 'zh-CN', onResult: alts => { onResult(alts); }, onError: m => onError(m), onEnd: done });
      return () => N.stt.stop();
    }
    if (eng === 'browser') {
      let r; try { r = new ASR(); } catch (err) { onError('speech recognition unavailable'); done(); return () => {}; }
      r.lang = 'zh-CN'; r.interimResults = false; r.maxAlternatives = 5; let got = false;
      r.onresult = ev => { got = true; onResult(Array.from(ev.results[0]).map(a => a.transcript)); };
      r.onerror = ev => { onError(ev.error === 'not-allowed' ? 'microphone blocked — allow it in the browser' : ev.error === 'no-speech' ? 'no speech heard' : 'error: ' + ev.error); };
      r.onend = () => { if (!got) onError('nothing heard'); done(); };
      r.start();
      return () => { try { r.stop(); } catch (e) { /* ignore */ } };
    }
    if (eng === 'cloud') {
      let rec, timer;
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        const chunks = []; rec = new MediaRecorder(stream);
        rec.ondataavailable = ev => chunks.push(ev.data);
        rec.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          try { const text = await window.SenLinCloud.stt(new Blob(chunks, { type: rec.mimeType })); if (text) onResult([text]); else onError('nothing heard'); }
          catch (e) { onError(e && e.message ? e.message : 'cloud recognition failed'); }
          done();
        };
        rec.start(); timer = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, seconds * 1000);
      }).catch(err => { onError('microphone unavailable: ' + (err.message || err.name)); done(); });
      return () => { clearTimeout(timer); if (rec && rec.state === 'recording') rec.stop(); };
    }
    onError('no speech recognition here — use Chrome, the app, or sign in for the cloud recogniser'); done();
    return () => {};
  }
  const sayBtn = target => `<button class="btn btn-icon" data-listen="${esc(target)}" title="Say it — I’ll check" aria-label="Say it">🎤</button>`;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-listen]'); if (!b) return;
    const target = b.dataset.listen; const out = b.parentElement.querySelector('.asr') || b.parentElement.appendChild(Object.assign(document.createElement('span'), { className: 'asr small' }));
    if (b.dataset.stop) { b.dataset.stop = ''; if (b._stop) b._stop(); return; }
    out.textContent = listenEngine() === 'cloud' ? 'recording… (tap again to stop)' : 'listening…'; b.dataset.stop = '1';
    b._stop = listenOnce({
      onResult: alts => {
        const best = alts.map(a => ({ a, s: matchScore(target, a) })).sort((x, y) => y.s - x.s)[0];
        const pct = Math.round(best.s * 100);
        state.progress.said = state.progress.said || { total: 0, good: 0 }; state.progress.said.total++; if (pct >= 80) state.progress.said.good++; save();
        out.innerHTML = `${pct >= 80 ? '✅' : pct >= 50 ? '🟡' : '❌'} heard “<span class="hz">${esc(best.a)}</span>” · ${pct}% match`;
        if (window.SenLinCloud) window.SenLinCloud.track('say', { pct });
      },
      onError: msg => { out.textContent = msg; },
      onEnd: () => { b.dataset.stop = ''; }
    });
  });

  /* ---- Record & compare: record yourself, then play it back next to the native voice */
  const recBtn = () => (navigator.mediaDevices && window.MediaRecorder) ? `<button class="btn btn-icon" data-rec title="Record yourself" aria-label="Record yourself">⏺</button>` : '';
  let recorder = null;
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-rec]'); if (!b) return;
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = []; recorder = new MediaRecorder(stream);
      recorder.ondataavailable = ev => chunks.push(ev.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
        let a = b.parentElement.querySelector('audio.mine'); if (!a) { a = document.createElement('audio'); a.className = 'mine'; a.controls = true; a.style.height = '32px'; b.parentElement.appendChild(a); }
        a.src = url; a.play(); b.textContent = '⏺'; b.classList.remove('btn-primary');
      };
      recorder.start(); b.textContent = '⏹'; b.classList.add('btn-primary');
      setTimeout(() => { if (recorder && recorder.state === 'recording') recorder.stop(); }, 12000);
    } catch (err) { toast('Microphone unavailable: ' + (err.message || err.name)); }
  });

  /* ------------------------------------------------------------ helpers */
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }
  function openDialog(html) { const d = $('#dialog'); $('#dialog-inner').innerHTML = html; d.showModal(); }
  $('#dialog').addEventListener('click', e => { if (e.target.id === 'dialog' || e.target.closest('[data-close]')) $('#dialog').close(); });
  const toneClass = p => 't' + S.parsePinyin(p).tone;
  /** colour every syllable of a pinyin string by tone */
  function pinyinHTML(p) {
    return p.split(/(\s+|['’])/).map(part => (/^\s+$/.test(part) || /^['’]$/.test(part) || !part) ? esc(part) : `<span class="${toneClass(part)}">${esc(part)}</span>`).join('');
  }
  const fmtDate = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtDateY = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const seconds = s => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
  function toneSVG(tone) {
    const paths = { 1: 'M10 20 H90', 2: 'M10 50 L90 12', 3: 'M10 30 L45 58 L90 20', 4: 'M10 12 L90 58', 5: 'M45 40 h10' };
    return `<svg viewBox="0 0 100 70" width="60" height="42" aria-hidden="true"><line x1="10" y1="10" x2="10" y2="60" stroke="currentColor" opacity=".2"/><path d="${paths[tone]}" fill="none" stroke="var(--tone${tone})" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  const streak = () => {
    const done = state.progress.completed; let n = 0; let d = todayDay();
    if (!done[d]) d--;
    while (d >= 1 && done[d]) { n++; d--; }
    return n;
  };
  const TREE_COLORS = ['#1ec27c', '#14a066', '#3ee39a', '#b8f23c', '#0f7a4f', '#ffb300'];
  function forestSVG(n) {
    let out = ''; for (let i = 0; i < Math.min(n, 60); i++) { const c = TREE_COLORS[i % TREE_COLORS.length]; out += `<svg viewBox="0 0 22 44" style="animation-delay:${Math.min(i, 30) * 25}ms"><rect x="9.5" y="30" width="3" height="14" rx="1" fill="#8a5a2b"/><path d="M11 2 L21 20 H1 Z" fill="${c}"/><path d="M11 10 L21 30 H1 Z" fill="${c}" opacity=".85"/></svg>`; }
    if (n > 60) out += `<span class="small muted" style="align-self:center;margin-left:.4rem">+${n - 60}</span>`;
    return out;
  }
  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas'); c.className = 'confetti'; document.body.appendChild(c);
    const ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    const cols = ['#1ec27c', '#ffcf4d', '#ff7bd4', '#2f8bff', '#b8f23c', '#ff4d5a'];
    const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, r: 4 + Math.random() * 6, vx: -1.5 + Math.random() * 3, vy: 2 + Math.random() * 3, rot: Math.random() * 6, vr: -.2 + Math.random() * .4, col: cols[Math.floor(Math.random() * cols.length)] }));
    let t = 0; (function frame() { ctx.clearRect(0, 0, c.width, c.height); ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.rot += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .6); ctx.restore(); }); if (++t < 220) requestAnimationFrame(frame); else c.remove(); })();
  }
  /** Where the learner stands on the HSK ladder, with dates at the current pace. */
  function levelStatus() {
    const st = S.curriculumStats(DAYS); const today = todayDay(); const done = state.progress.completed;
    let prevEnd = 12;
    return st.levels.map(l => {
      const start = prevEnd + 1, end = l.lastDay; prevEnd = end;
      const total = end - start + 1; let completed = 0; for (let d = start; d <= end; d++) if (done[d]) completed++;
      const status = completed >= total ? 'done' : today >= start ? 'current' : 'locked';
      return Object.assign({}, l, { start, end, total, completed, status, startDate: S.dateForDay(start, state.settings.startDate), endDate: S.dateForDay(end, state.settings.startDate) });
    });
  }
  const currentLevelInfo = () => { const ls = levelStatus(); return ls.find(l => l.status === 'current') || ls.filter(l => l.status === 'done').pop() || ls[0]; };
  const monthsBetween = (a, b) => Math.max(1, Math.round((b - a) / (30.44 * 86400000)));
  const learnedChars = () => S.learnedItems(DAYS, Math.min(todayDay(), DAYS.length)).filter(i => i.type === 'c' && state.progress.completed[i.day]).length;
  const dueCount = () => { const now = Date.now(); return Object.values(state.srs).filter(s => s.due <= now).length; };

  /* ------------------------------------------------------------ router */
  const routes = {};
  const LAZY = window.SENLIN_LAZY || { pending: false, load: () => Promise.resolve() };
  /** Routes that show the whole curriculum wait for HSK 4–6 to arrive (a few hundred KB, once). */
  function needsAllLevels(name, arg) {
    if (!LAZY.pending) return false;
    if (/^(library|levels|progress|plan)$/.test(name)) return true;
    if (name === 'lesson' || name === 'review') { const d = parseInt(arg, 10) || todayDay(); return d > (LAZY.end3 || 0) - 3; }
    return false;
  }
  /** Paywall (js/config.js → paywall:true): HSK 1 stays free, the rest needs a Pro plan. */
  const locked = day => !!CFG.paywall && day > (CFG.freeDays || 45) && !(window.SenLinCloud && window.SenLinCloud.isPro());
  const upsell = what => `<div class="stack-lg" style="max-width:640px"><section class="card card-gold stack">
      <span class="eyebrow">SenLin Pro</span><h1 class="h2">${esc(what)} is part of Pro</h1>
      <p class="lead">HSK 1 is free forever. Pro unlocks the whole road to HSK 6, the Deal Desk, cloud sync and the cloud voice.</p>
      <div class="row"><a class="btn btn-primary" href="#/pro">See plans — from $5 a month</a><a class="btn" href="#/settings">Sign in</a><a class="btn btn-ghost" href="#/">Back</a></div>
    </section></div>`;
  function navigate() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, arg] = hash.split('/');
    let view = routes[name || 'today'] || routes.today;
    if (needsAllLevels(name, arg)) {
      app.innerHTML = '<div class="card stack" style="max-width:520px"><p class="lead">Loading HSK 4–6…</p><p class="muted small">A few hundred kilobytes, once. The site keeps them for offline use.</p></div>';
      LAZY.load().then(() => { rebuild(); navigate(); }).catch(() => { app.innerHTML = '<div class="card"><p>Could not load HSK 4–6. Check your connection and reload.</p></div>'; });
      return;
    }
    if ((name === 'lesson' && locked(parseInt(arg, 10) || todayDay())) || (name === 'business' && CFG.paywall && !(window.SenLinCloud && window.SenLinCloud.isPro()))) {
      const what = name === 'business' ? 'The Deal Desk' : 'This lesson';
      view = Object.assign(() => upsell(what), { after: () => { const b = $('#go-pro'); if (b) b.onclick = () => window.SenLinCloud && window.SenLinCloud.buy(); } });
    }
    document.querySelectorAll('.nav a').forEach(a => { if (a.dataset.route === (name || 'today')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (lesson.timer) lesson.stop();
    window.scrollTo(0, 0);
    app.innerHTML = view(arg);
    if (view.after) view.after(arg);
  }
  window.addEventListener('hashchange', navigate);

  /* ------------------------------------------------------------ TODAY */
  routes.today = function () {
    const day = todayDay();
    const info = dayInfo(day);
    const done = !!state.progress.completed[day];
    const missed = []; for (let d = 1; d < day; d++) if (!state.progress.completed[d] && d <= DAYS.length) missed.push(d);
    const beyond = day > DAYS.length;
    const preview = info.type === 'pron'
      ? `<p class="lead">${esc(info.pron.title)}</p><p class="muted">${esc(info.pron.brief)}</p>`
      : `<div class="row">${info.chars.map(c => `<span class="chip chip-gold"><span class="hz">${c.h}</span> ${esc(c.p)} · ${esc(c.m)}</span>`).join('')}${info.words.map(w => `<span class="chip"><span class="hz">${w.w}</span> ${esc(w.m)}</span>`).join('')}</div>
         ${info.sentences.length || (info.grammar || []).length ? `<p class="muted small" style="margin-top:.6rem">${info.sentences.length ? `${info.sentences.length} new sentence${info.sentences.length > 1 ? 's' : ''} to shadow.` : ''}${(info.grammar || []).length ? ` Pattern: ${esc(info.grammar[0].name)}.` : ''}</p>` : ''}`;
    return `
      <div class="stack-lg">
        <section class="card card-accent stack">
          <span class="eyebrow">${fmtDate(new Date())} · Day ${day}${beyond ? ' · beyond the scheduled curriculum' : ''}</span>
          ${(() => { const L = currentLevelInfo(); if (!L) return ''; const info = (S.LEVELINFO && S.LEVELINFO.levels.find(x => x.level === L.level)) || {}; return `<div class="row"><a class="chip chip-gold" href="#/levels"><b>${esc(L.name)}</b> · ${esc(info.cefr || '')} · ${L.completed}/${L.total} days</a><span class="muted small">${L.status === 'done' ? 'level complete' : `on track to finish ${esc(L.name)} by ${esc(fmtDateY(L.endDate))}`}</span></div>`; })()}
          <h1 class="h1">${done ? 'Today’s tree is planted. 🌳' : beyond ? 'Consolidation day' : esc(info.phase)}</h1>
          <p class="muted" style="font-weight:700">Building your Mandarin Word Forest, one tree at a time.</p>
          <div>${beyond ? '<p class="lead">You have completed the scheduled curriculum. Review is due — keep the forest alive.</p>' : preview}</div>
          <div class="row">
            <a class="btn btn-gold btn-lg" href="#/lesson/${Math.min(day, DAYS.length)}">${done ? 'Do it again' : 'Start the 10-minute lesson'}</a>
            ${dueCount() ? `<a class="btn btn-ghost" href="#/review" style="color:#fff;border-color:rgba(255,255,255,.4)">Review ${dueCount()} due cards</a>` : ''}
            <span class="streak"><span class="fire">🔥</span> ${streak()}-day streak</span>
          </div>
        </section>
        ${Object.keys(state.progress.completed).length ? `<section class="card stack" style="padding-bottom:.6rem"><div class="row between"><span class="eyebrow">Your forest · ${Object.keys(state.progress.completed).length} trees</span><a class="small muted" href="#/progress">see progress →</a></div><div class="forest">${forestSVG(Object.keys(state.progress.completed).length)}</div></section>` : ''}
        <section class="grid grid-3">
          <div class="card stat"><b>${streak()}</b><span>day streak</span></div>
          <div class="card stat"><b>${learnedChars()}</b><span>characters planted</span></div>
          <div class="card stat"><b>${Object.keys(state.progress.completed).length}</b><span>lessons completed</span></div>
        </section>
        ${missed.length ? `<section class="card stack">
          <h2 class="h3">Catch-up (${missed.length} missed)</h2>
          <p class="muted small">Missed days never expire. Do the oldest first — each lesson builds on the last.</p>
          <div class="row">${missed.slice(0, 14).map(d => `<a class="chip" href="#/lesson/${d}">Day ${d}</a>`).join('')}${missed.length > 14 ? `<span class="chip">+${missed.length - 14} more</span>` : ''}</div>
        </section>` : ''}
        <section class="card stack" style="border-left:4px solid var(--gold)">
          <div class="row between"><div><h2 class="h3">Talk with 森林老师 — live 1-on-1</h2><p class="muted small">Role-play a café order, a taxi ride, a job interview. Speak or type; get corrected in real time.</p></div><a class="btn btn-primary" href="#/talk">Start a conversation</a></div>
        </section>
        <section class="grid grid-2">
          <div class="card stack">
            <h2 class="h3">How a lesson works</h2>
            <ul class="stack small muted" style="gap:.4rem">
              <li><b>1:00</b> Warm-up — one tone pair, spoken aloud.</li>
              <li><b>2:30</b> Review — spaced-repetition flashcards, graded by you.</li>
              <li><b>3:30</b> New — three characters as movie scenes (actor + set + room + props).</li>
              <li><b>2:00</b> Sentences — shadow the speaker three times each.</li>
              <li><b>1:00</b> Quiz — five questions. Then you are done.</li>
            </ul>
          </div>
          <div class="card stack">
            <h2 class="h3">Your curriculum</h2>
            ${(() => { const st = S.curriculumStats(DAYS); return `<p class="muted small">${st.pronDays} days of Pronunciation Mastery, then ${st.characters} characters, ${st.words} words and ${st.sentences} sentences over ${st.days} days. Every word appears only after all its characters; every sentence only after all its words.</p>`; })()}
            <div class="row"><a class="btn btn-sm" href="#/library">Browse the library</a><a class="btn btn-sm" href="#/plan">See all days</a><a class="btn btn-sm" href="#/tones">Tone gym</a></div>
          </div>
        </section>
      </div>`;
  };

  /* ------------------------------------------------------------ PLAN (all days) */
  routes.plan = function () {
    const today = todayDay();
    return `<div class="stack"><span class="eyebrow">Curriculum</span><h1 class="h2">Every day, at a glance</h1>
      <table class="table"><thead><tr><th>Day</th><th>Date</th><th>Phase</th><th>New</th><th></th></tr></thead><tbody>
      ${DAYS.map(d => `<tr${d.day === today ? ' style="background:var(--accent-soft)"' : ''}><td>${d.day}</td><td class="small muted" style="white-space:nowrap">${fmtDate(S.dateForDay(d.day, state.settings.startDate)).replace(/^(\w+), /, '<span class="hide-sm">$1, </span>')}</td><td class="small">${d.type === 'pron' ? esc(d.pron.title) : esc(d.phase)}</td>
        <td class="hz">${d.chars.map(c => c.h).join(' ')} <span class="small muted">${d.words.map(w => w.w).join(' · ')}</span></td>
        <td><a class="btn btn-sm${state.progress.completed[d.day] ? '' : ' btn-ghost'}" href="#/lesson/${d.day}">${state.progress.completed[d.day] ? '✓ done' : 'open'}</a></td></tr>`).join('')}
      </tbody></table></div>`;
  };

  /* ------------------------------------------------------------ LESSON */
  const lesson = { day: 0, data: null, seg: 0, elapsed: 0, timer: null, review: { i: 0, shown: false }, quiz: { i: 0, right: 0, answered: false }, shadow: {} };
  lesson.stop = function () { clearInterval(lesson.timer); lesson.timer = null; };
  lesson.start = function (day) {
    lesson.stop();
    lesson.day = day; lesson.seg = 0; lesson.elapsed = 0;
    lesson.review = { i: 0, shown: false }; lesson.quiz = { i: 0, right: 0, answered: false }; lesson.shadow = {};
    lesson.data = S.buildLesson(day, DAYS, state.srs, state.cast, Date.now());
    if (window.SenLinCloud) window.SenLinCloud.track('lesson_start', { day });
    const extraDue = window.SenLinApp.extraReviewItems().filter(i => state.srs[i.id] && state.srs[i.id].due <= Date.now());
    if (extraDue.length) lesson.data.review = extraDue.concat(lesson.data.review).slice(0, S.CONFIG.reviewCap + 4);
    lesson.timer = setInterval(() => { lesson.elapsed++; const c = $('#clock'); if (c) { const left = S.CONFIG.lessonMinutes * 60 - lesson.elapsed; c.textContent = (left < 0 ? '+' : '') + seconds(left); c.classList.toggle('over', left < 0); } }, 1000);
  };
  routes.lesson = function (arg) {
    const day = Math.max(1, Math.min(parseInt(arg, 10) || todayDay(), DAYS.length));
    if (lesson.day !== day || !lesson.data) lesson.start(day);
    return `<div class="lesson-top"><div class="container timer">
        <span class="clock" id="clock">${seconds(S.CONFIG.lessonMinutes * 60 - lesson.elapsed)}</span>
        <div class="segments" id="segments"></div>
        <a class="btn btn-sm btn-ghost" href="#/">Exit</a>
      </div></div>
      <div id="segment"></div>`;
  };
  routes.lesson.after = () => renderSegment();

  function renderSegment() {
    const L = lesson.data; const segs = S.CONFIG.segments;
    $('#segments').innerHTML = segs.map((s, i) => `<button class="${i < lesson.seg ? 'done' : i === lesson.seg ? 'active' : ''}" data-seg="${i}" title="${esc(s.title)}"><span>${esc(s.title.split(':')[0])}</span></button>`).join('')
      + `<button class="${lesson.seg >= segs.length ? 'active' : ''}" data-seg="${segs.length}" title="Done"><span>Done</span></button>`;
    $('#segments').querySelectorAll('button').forEach(b => b.onclick = () => { lesson.seg = +b.dataset.seg; renderSegment(); });
    const seg = segs[lesson.seg];
    const el = $('#segment');
    const head = (title, secs, note) => `<div class="seg-head"><div><span class="eyebrow">Day ${L.day} · ${lesson.seg + 1} of ${segs.length}</span><h2 class="h2">${esc(title)}</h2></div><span class="muted small">${Math.round(secs / 60 * 10) / 10} min${note ? ' · ' + esc(note) : ''}</span></div>`;
    const next = (label = 'Next →') => `<div class="row" style="margin-top:1.2rem;justify-content:flex-end"><button class="btn btn-primary" id="next">${label}</button></div>`;
    if (!seg) { el.innerHTML = renderDone(); wireDone(); return; }
    let html = head(seg.title, seg.seconds, seg.id === 'review' ? `${L.review.length} cards` : seg.id === 'sentences' ? `${L.sentences.length} sentences` : '');
    if (seg.id === 'warmup') html += renderWarmup(L) + next();
    if (seg.id === 'review') html += renderReview(L);
    if (seg.id === 'new') html += renderNew(L) + next();
    if (seg.id === 'sentences') html += renderSentences(L) + next();
    if (seg.id === 'quiz') html += renderQuiz(L);
    el.innerHTML = html;
    wireSegment(seg.id);
    const n = $('#next'); if (n) n.onclick = () => { lesson.seg++; window.scrollTo(0, 0); renderSegment(); };
  }

  function renderWarmup(L) {
    const tp = L.warmup.tonePair; const [a, b] = tp.pair.split('-').map(Number);
    const ex = tp.ex.split(' — ')[0];
    const hz = ex.split(' ')[0];
    return `<div class="stack" style="margin-top:1rem">
      <div class="card stack">
        <span class="eyebrow">Tone pair of the day · ${tp.pair}</span>
        <div class="row" style="gap:1.2rem;align-items:center">
          <div class="row" style="gap:.2rem">${toneSVG(a)}${toneSVG(b)}</div>
          <div><div class="mid-hz">${esc(hz)}</div><div class="py">${pinyinHTML(ex.replace(hz, '').trim())}</div><div class="muted small">${esc(tp.en)}</div></div>
          <div class="row">${playBtn(hz)}${playBtn(hz, { slow: true, rate: 0.6 })}</div>
        </div>
        <p class="muted small">Listen, then say it five times. Exaggerate the contours: high-flat, rising, low-dip, falling.</p>
      </div>
      ${L.warmup.kind === 'pron' ? `<div class="card stack"><span class="eyebrow">Sound drills</span>${L.warmup.drills.map(d => `<div class="row between"><span class="py" style="font-size:1.2rem">${pinyinHTML(d.replace(/\(.*\)/, ''))} <span class="muted small">${esc((d.match(/\(.*\)/) || [''])[0])}</span></span>${playBtn(d.replace(/\(.*\)|[→]/g, ''))}</div>`).join('')}</div>`
        : !L.warmup.drills.length ? `<div class="card stack"><span class="eyebrow">Your first tree day</span><p class="muted small">Nothing to recall yet: today you plant the first three characters. From tomorrow this card holds yesterday's characters to say aloud from memory.</p></div>`
        : `<div class="card stack"><span class="eyebrow">Say these aloud from memory</span><div class="grid grid-tiles">${L.warmup.drills.map(c => `<div class="tile"><span class="hz">${c.h}</span><span class="py">${pinyinHTML(c.p)}</span><span class="muted small">${esc(c.m)}</span><span>${playBtn(c.h)}</span></div>`).join('')}</div></div>`}
    </div>`;
  }

  function renderReview(L, r) {
    r = r || lesson.review; const card = L.review[r.i];
    if (!card) return `<div class="card stack" style="margin-top:1rem"><p class="lead">${L.review.length ? 'Review complete.' : 'Nothing to review yet — new items start appearing tomorrow.'}</p>${L.review.length ? `<p class="muted small">${L.review.length} cards graded. The engine schedules each one again when you are about to forget it.</p>` : ''}</div>` + `<div class="row" style="margin-top:1.2rem;justify-content:flex-end"><button class="btn btn-primary" id="next">${r.standalone ? 'Done' : 'Next →'}</button></div>`;
    const x = card.ref;
    const front = card.type === 'c' ? `<div class="big-hz">${x.h}</div>` : card.type === 'w' ? `<div class="mid-hz" style="font-size:3rem">${x.w}</div>` : `<div class="mid-hz">${esc(x.zh)}</div>`;
    const back = card.type === 's' ? `<div class="py" style="font-size:1.2rem">${pinyinHTML(x.p)}</div><div class="muted">${esc(x.en)}</div>` : `<div class="py" style="font-size:1.4rem">${pinyinHTML(x.p)}</div><div class="muted">${esc(x.m)}</div>`;
    const say = card.type === 'c' ? x.h : card.type === 'w' ? x.w : x.zh;
    return `<div class="stack" style="margin-top:1rem">
      <p class="muted small">Card ${r.i + 1} of ${L.review.length} · say the pronunciation and meaning out loud, then reveal.</p>
      <div class="card flash" id="flash">${front}${r.shown ? `<div class="answer">${back}<div>${playBtn(say)}</div></div>` : '<span class="faint small">tap to reveal</span>'}</div>
      ${r.shown ? `<div class="grades">
        <button class="btn g-again" data-grade="0">Again</button><button class="btn g-hard" data-grade="1">Hard</button><button class="btn g-good" data-grade="2">Good</button><button class="btn g-easy" data-grade="3">Easy</button></div>`
        : `<button class="btn btn-block" id="reveal">Reveal</button>`}
      ${card.type === 'c' ? `<details class="small muted"><summary>Scene reminder</summary>${esc(state.scenes[x.h] || S.scene(x, state.cast).text)}</details>` : ''}
    </div>`;
  }

  function renderNew(L) {
    if (L.type === 'pron') return renderPron(L.pron);
    if (!L.chars.length) return `<div class="card stack" style="margin-top:1rem"><p class="lead">No new characters today — consolidation.</p><p class="muted">Pick three characters from the Library and re-tell their scenes out loud, from memory, before looking.</p><a class="btn" href="#/library">Open the library</a></div>` + (L.words.length ? renderWords(L.words) : '') + renderGrammar(L.grammar) + renderDealDesk(L.business);
    return `<div class="stack" style="margin-top:1rem">
      <p class="muted small">For each character: look, listen, then close your eyes and <b>see the scene</b> for ten seconds. The actor gives you the initial, the set gives the final, the room gives the tone, the props give the shape.</p>
      ${L.chars.map(({ ch, scene: sc }) => `<div class="card stack" data-char="${ch.h}">
        <div class="row between"><span class="eyebrow">${esc(sc.initial || 'no initial')}- + -${esc(sc.final)} + tone ${sc.tone}</span><span class="chip">${esc(sc.actor)} · ${esc(sc.set)} · ${esc(sc.room)}</span></div>
        <div class="grid" style="grid-template-columns:auto 1fr;gap:1.2rem;align-items:center">
          <div class="big-hz">${ch.h}</div>
          <div class="stack" style="gap:.4rem">
            <div class="py ${toneClass(ch.p)}" style="font-size:1.8rem">${esc(ch.p)} ${toneSVG(sc.tone)}</div>
            <div style="font-size:1.15rem;font-weight:700">${esc(ch.m)}</div>
            <div class="row">${playBtn(ch.h)}${playBtn(ch.h, { slow: true, rate: 0.6 })}${sayBtn(ch.h)}<button class="btn btn-sm" data-write="${ch.h}" title="Stroke order">✍️ Write</button></div>
          </div>
        </div>
        <div class="props">${sc.props.map(p => `<span class="chip"><span class="hz">${p.c}</span> ${esc(p.keyword)} → ${esc(p.prop)}</span>`).join('')}</div>
        <div class="scene">${esc(state.scenes[ch.h] || sc.text)}</div>
        <details class="small"><summary class="muted">Make it mine (edit the scene)</summary>
          <textarea class="input" data-scene="${ch.h}" placeholder="Rewrite the scene in your own words — the weirder and more vivid, the stickier.">${esc(state.scenes[ch.h] || sc.text)}</textarea></details>
      </div>`).join('')}
      ${L.words.length ? renderWords(L.words) : ''}
      ${renderGrammar(L.grammar)}
      ${renderDealDesk(L.business)}
    </div>`;
  }
  const renderDealDesk = b => !b || !state.settings.business ? '' : `<div class="card stack" style="border-left:4px solid var(--sky-500)"><div class="row between"><span class="eyebrow">Deal desk · business Mandarin · ${esc(b.terms[0].unitTitle)}</span><a class="small muted" href="#/business">all units →</a></div>
    ${b.terms.map(t => `<div class="row between"><div><span class="mid-hz">${esc(t.w)}</span> <span class="py">${pinyinHTML(t.p)}</span> <span class="muted">${esc(t.m)}</span>${t.note ? `<div class="small muted">${esc(t.note)}</div>` : ''}</div><span class="row">${playBtn(t.w)}${sayBtn(t.w)}<button class="btn btn-sm" data-addword="${esc(JSON.stringify({ w: t.w, p: t.p, m: t.m }))}">＋ deck</button></span></div>`).join('')}
    <div class="sentence" style="border-left-color:var(--sky-500)"><div class="row between"><span class="hz" style="font-size:1.25rem">${esc(b.phrase.zh)}</span><span class="row">${playBtn(b.phrase.zh)}${sayBtn(b.phrase.zh)}</span></div><div class="py small">${pinyinHTML(b.phrase.p)}</div><div class="muted small">${esc(b.phrase.en)}${b.phrase.note ? ' · ' + esc(b.phrase.note) : ''}</div></div></div>`;
  const renderGrammar = list => list.map(g => `<div class="card stack" style="border-left:4px solid var(--accent)"><span class="eyebrow">Pattern of the day · ${esc(g.name)}</span>
    <div class="mid-hz" style="font-size:1.3rem;font-family:var(--font-body)">${esc(g.pattern)}</div>
    <div class="row between"><div><span class="mid-hz">${esc(g.zh)}</span> <span class="py">${pinyinHTML(g.p)}</span><div class="muted">${esc(g.en)}</div></div><span class="row">${playBtn(g.zh)}${sayBtn(g.zh)}</span></div>
    <p class="small muted">${esc(g.note)}</p></div>`).join('');
  const renderWords = words => `<div class="card stack"><span class="eyebrow">New words — built from characters you already own</span>
    ${words.map(w => `<div class="row between"><div><span class="mid-hz">${w.w}</span> <span class="py">${pinyinHTML(w.p)}</span> <span class="muted">${esc(w.m)}</span></div>${playBtn(w.w)}</div>`).join('')}</div>`;

  function renderPron(p) {
    const c = S.resolveCast(state.cast);
    const castRow = (kind, key, label, ex, hint) => `<tr><td><b class="py">${esc(label)}</b><br><span class="small muted">${esc(ex)}</span></td><td class="small muted">${esc(hint)}</td><td><div class="row" style="flex-wrap:nowrap"><input class="input" data-cast="${kind}" data-key="${esc(key)}" value="${esc(kind === 'actors' ? c.actor(key) : c.set(key))}">${playBtn(ex.split(' ')[1] || ex.split(' ')[0])}</div></td></tr>`;
    return `<div class="stack" style="margin-top:1rem">
      <div class="card stack"><h3 class="h3">${esc(p.title)}</h3><p>${esc(p.brief)}</p></div>
      ${p.tones ? `<div class="card stack"><span class="eyebrow">The tones = rooms in every set</span>${p.tones.map(n => { const t = S.TONE_MAP[n]; return `<div class="row" style="gap:1rem">${toneSVG(n)}<div><b>${esc(t.name)}</b> <span class="muted">${esc(t.contour)}</span><br><span class="small muted">${esc(t.hint)} · room: <b>${esc(c.room(n))}</b></span></div></div>`; }).join('')}
        <div class="row">${['mā 妈', 'má 麻', 'mǎ 马', 'mà 骂', 'ma 吗'].map(x => `<span class="chip chip-gold"><span class="py ${toneClass(x)}">${esc(x)}</span>${playBtn(x.split(' ')[1])}</span>`).join('')}</div></div>` : ''}
      ${p.initials ? `<div class="card stack"><span class="eyebrow">Cast these actors (people you can picture instantly)</span><table class="table"><thead><tr><th>Sound</th><th>How</th><th>Your actor</th></tr></thead><tbody>
        ${p.initials.map(k => { const i = S.INITIAL_MAP[k]; return castRow('actors', k, k + '-', i.ex, i.hint); }).join('')}</tbody></table></div>` : ''}
      ${p.finalsIntro ? `<div class="card stack"><span class="eyebrow">Assign these sets (real places you know by heart)</span><table class="table"><thead><tr><th>Final</th><th>How</th><th>Your place</th></tr></thead><tbody>
        ${p.finalsIntro.map(k => { const f = S.FINAL_MAP[k]; return castRow('sets', k, '-' + k, f.ex, f.hint); }).join('')}</tbody></table></div>` : ''}
      ${p.pairs ? `<div class="card stack"><span class="eyebrow">Tone pairs</span>${p.pairs.map(pr => { const tp = S.PINYIN.tonePairs.find(t => t.pair === pr); const [a, b] = pr.split('-').map(Number); const hz = tp.ex.split(' ')[0]; return `<div class="row between"><div class="row" style="gap:.8rem"><span class="row" style="gap:0">${toneSVG(a)}${toneSVG(b)}</span><span><b>${pr}</b> <span class="hz">${esc(hz)}</span> <span class="py">${pinyinHTML(tp.ex.replace(hz, '').split('—')[0].trim())}</span> <span class="muted small">${esc(tp.en)}</span></span></div>${playBtn(hz)}</div>`; }).join('')}</div>` : ''}
      ${p.props ? `<div class="card stack"><span class="eyebrow">Your first ten props</span><div class="grid grid-tiles">${p.props.map(k => { const cp = S.COMP_MAP[k]; return `<div class="tile"><span class="hz">${k}</span><b>${esc(cp.k)}</b><input class="input" data-cast="props" data-key="${k}" value="${esc(c.prop(k))}"></div>`; }).join('')}</div></div>` : ''}
      ${p.drills.length ? `<div class="card stack"><span class="eyebrow">Drills</span>${p.drills.map(d => `<div class="row between"><span class="py" style="font-size:1.2rem">${pinyinHTML(d.replace(/\(.*\)/, ''))} <span class="muted small">${esc((d.match(/\(.*\)/) || [''])[0])}</span></span>${playBtn(d.replace(/\(.*\)|[→]/g, ''))}</div>`).join('')}</div>` : ''}
      <div class="card card-soft"><b>Task:</b> ${esc(p.task)}</div>
    </div>`;
  }

  function renderSentences(L) {
    if (!L.sentences.length) return `<div class="card" style="margin-top:1rem"><p class="lead">Sentences begin once you own a few characters. Use the time to replay today’s scenes with your eyes closed.</p></div>`;
    return `<div class="stack" style="margin-top:1rem">
      <p class="muted small">Shadowing: play, then speak <b>with</b> the voice, matching rhythm and tones. Three passes each — first with pinyin, then with the English hidden, then eyes closed.${ASR ? ' Tap 🎤 to say it and get checked.' : ''}${(navigator.mediaDevices && window.MediaRecorder) ? ' Tap ⏺ to record yourself and compare.' : ''}</p>
      ${L.sentences.map((s, i) => `<div class="sentence">
        <div class="row between"><span class="mid-hz">${esc(s.zh)}</span><span class="row">${playBtn(s.zh)}${playBtn(s.zh, { slow: true, rate: 0.6 })}${sayBtn(s.zh)}${recBtn()}</span></div>
        <div class="py">${pinyinHTML(s.p)}</div>
        <div class="en hidden" data-reveal>${esc(s.en)}</div>
        <div class="row"><span class="small muted">Passes:</span>${[1, 2, 3].map(n => `<button class="btn btn-sm${(lesson.shadow[i] || 0) >= n ? ' btn-primary' : ''}" data-shadow="${i}" data-n="${n}">${n}</button>`).join('')}</div>
      </div>`).join('')}
    </div>`;
  }

  function renderQuiz(L) {
    const q = lesson.quiz; const item = L.quiz[q.i];
    if (!item) return `<div class="card stack" style="margin-top:1rem"><p class="lead">${q.right} / ${L.quiz.length} correct.</p><p class="muted small">${q.right === L.quiz.length ? 'Perfect. ' : ''}Anything you missed will come back in tomorrow’s review.</p></div><div class="row" style="margin-top:1.2rem;justify-content:flex-end"><button class="btn btn-primary" id="next">Finish →</button></div>`;
    return `<div class="stack" style="margin-top:1rem">
      <p class="muted small">Question ${q.i + 1} of ${L.quiz.length}</p>
      <div class="card stack">${item.kind === 'listen'
        ? `<div class="row" style="justify-content:center"><button class="btn btn-lg btn-primary" data-say="${esc(item.prompt)}">🔊 Play</button><button class="btn" data-say="${esc(item.prompt)}" data-rate="0.6">🐢</button></div><p style="text-align:center" class="muted">${esc(item.question)}${window.speechSynthesis ? '' : ` (${esc(item.pinyin)})`}</p>`
        : `<div class="big-hz" style="font-size:4rem">${esc(item.prompt)}</div><p style="text-align:center" class="muted">${esc(item.question)}</p>`}
        <div class="stack" style="gap:.5rem">${item.options.map(o => `<button class="quiz-opt${item.kind === 'listen' ? ' hz' : ''}" data-opt="${esc(o)}" style="${item.kind === 'listen' ? 'font-size:1.4rem' : ''}">${item.kind !== 'listen' && item.question.includes('pronounced') ? pinyinHTML(o) : esc(o)}</button>`).join('')}</div>
        <div id="quiz-next"></div></div></div>`;
  }

  function renderDone() {
    const L = lesson.data; const wasDone = !!state.progress.completed[L.day];
    if (!wasDone) {
      state.progress.completed[L.day] = S.isoDate(new Date());
      if (window.SenLinCloud) window.SenLinCloud.track('lesson_done', { day: L.day, quiz: lesson.quiz.right });
      /* enter today's new items into spaced repetition */
      const now = Date.now();
      S.learnedItems(DAYS, L.day).filter(i => i.day === L.day).forEach(i => { if (!state.srs[i.id]) { const s = S.srsInit(); s.due = now + 86400000; state.srs[i.id] = s; } });
      save();
    }
    const stats = S.curriculumStats(DAYS); const pct = Math.round(Object.keys(state.progress.completed).length / stats.days * 100);
    const nextDay = L.day + 1;
    return `<div class="card done-banner" style="margin-top:1rem">
      <div class="big-hz">${L.chars.length ? L.chars.map(c => c.ch.h).join('') : '森'}</div>
      <h2 class="h2">Day ${L.day} complete</h2>
      <p style="font-weight:800;color:var(--lime-400)">Building your Mandarin Word Forest, one tree at a time. 🌲</p>
      <p class="muted">${Math.round(lesson.elapsed / 60)} min ${lesson.elapsed % 60} s · ${streak()}-day streak · ${learnedChars()} characters planted</p>
      <div class="progress-ring" style="--p:${pct}"><div>${pct}%</div></div>
      <p class="muted small">${nextDay <= DAYS.length ? `Tomorrow (Day ${nextDay}): ${dayInfo(nextDay).type === 'pron' ? esc(dayInfo(nextDay).pron.title) : dayInfo(nextDay).chars.map(c => c.h).join(' ') + ' + ' + dayInfo(nextDay).words.length + ' words'}` : 'The scheduled curriculum is complete — keep reviewing daily.'}</p>
      <div class="row" style="justify-content:center"><a class="btn btn-primary" href="#/">Back to Today</a><a class="btn" href="#/progress">Progress</a></div>
    </div>${reviewPrompt()}`;
  }
  /** Rating prompt at a good moment only: a finished lesson on a 3-day streak, at most once per 90 days, only where a store listing exists. */
  function storeLink() { const st = CFG.store || {}; const N = window.SenLinNative; const ua = navigator.userAgent || ''; if (N && N.isNative && N.platform === 'ios') return st.ios; if (/android/i.test(ua) || (N && N.isNative)) return st.android; return ''; }
  function reviewPrompt() {
    const link = storeLink(); if (!link) return '';
    const r = store.get('review', {}); if (r.done || (r.askedAt && Date.now() - r.askedAt < 90 * 86400000)) return '';
    if (streak() < 3 || Object.keys(state.progress.completed).length < 3) return '';
    return `<div class="card stack" id="review-card" style="margin-top:1rem"><span class="eyebrow">A small favour</span><p><b>Enjoying SenLin?</b> A rating helps other learners find it, and takes a few seconds.</p>
      <div class="row"><a class="btn btn-primary" id="review-yes" href="${esc(link)}" target="_blank" rel="noopener">Rate SenLin</a><button class="btn btn-ghost" id="review-later">Not now</button></div></div>`;
  }
  function wireDone() {
    lesson.stop(); confetti();
    const card = $('#review-card'); if (!card) return;
    const seen = (done) => { store.set('review', { askedAt: Date.now(), done: !!done }); card.remove(); if (window.SenLinCloud) window.SenLinCloud.track('review_prompt', { done: !!done }); };
    $('#review-yes').onclick = () => { const N = window.SenLinNative; if (N && N.isNative && N.review) { try { N.review(); } catch (e) { /* fall back to the link */ } } seen(true); };
    $('#review-later').onclick = () => seen(false);
  }

  function wireSegment(id) {
    const L = lesson.data;
    if (id === 'review') { wireReview(L, lesson.review, renderSegment); document.addEventListener('keydown', reviewKeys); }
    else document.removeEventListener('keydown', reviewKeys);
    document.querySelectorAll('[data-scene]').forEach(t => t.oninput = () => { state.scenes[t.dataset.scene] = t.value.trim(); save(); });
    document.querySelectorAll('[data-cast]').forEach(i => i.oninput = () => { state.cast[i.dataset.cast][i.dataset.key] = i.value.trim(); save(); });
    document.querySelectorAll('[data-reveal]').forEach(e => e.onclick = () => e.classList.remove('hidden'));
    document.querySelectorAll('[data-addword]').forEach(b => b.onclick = () => { if (window.SenLinApp.addWord) { window.SenLinApp.addWord(JSON.parse(b.dataset.addword)); b.textContent = '✓ in deck'; } });
    document.querySelectorAll('[data-shadow]').forEach(b => b.onclick = () => { lesson.shadow[b.dataset.shadow] = +b.dataset.n; renderSegment(); });
    if (id === 'quiz') { const q = L.quiz[lesson.quiz.i]; if (q && q.kind === 'listen' && !lesson.quiz.answered) setTimeout(() => tts.speak(q.prompt), 300); }
    if (id === 'quiz') document.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
      const q = lesson.quiz; if (q.answered) return; q.answered = true;
      const item = L.quiz[q.i]; const ok = b.dataset.opt === item.correct;
      state.progress.quiz.total++; if (ok) { q.right++; state.progress.quiz.right++; } save();
      document.querySelectorAll('[data-opt]').forEach(o => { if (o.dataset.opt === item.correct) o.classList.add('right'); else if (o === b) o.classList.add('wrong'); });
      $('#quiz-next').innerHTML = `<div class="row" style="justify-content:flex-end"><button class="btn btn-primary" id="qn">${ok ? 'Correct →' : 'Next →'}</button></div>`;
      $('#qn').onclick = () => { q.i++; q.answered = false; renderSegment(); };
    });
  }
  function wireReview(L, r, rerender) {
    const reveal = () => { r.shown = true; rerender(); };
    const f = $('#flash'); if (f && !r.shown) f.onclick = reveal;
    const rb = $('#reveal'); if (rb) rb.onclick = reveal;
    document.querySelectorAll('[data-grade]').forEach(b => b.onclick = () => {
      const card = L.review[r.i]; const g = +b.dataset.grade;
      state.srs[card.id] = S.srsReview(state.srs[card.id], g, Date.now());
      state.progress.reviews.total++; if (g >= 2) state.progress.reviews.good++;
      save(); r.i++; r.shown = false; rerender();
    });
  }
  /* ---- Review anytime: every due card, outside the daily lesson */
  routes.review = function () {
    const now = Date.now();
    const learned = S.learnedItems(DAYS, Math.min(todayDay(), DAYS.length)).filter(i => state.progress.completed[i.day]).concat(window.SenLinApp.extraReviewItems());
    const due = learned.filter(i => state.srs[i.id] && state.srs[i.id].due <= now).sort((a, b) => state.srs[a.id].due - state.srs[b.id].due).slice(0, 40);
    routes.review.L = { review: due }; routes.review.r = { i: 0, shown: false, standalone: true };
    return `<div class="stack"><div class="row between"><div><span class="eyebrow">Review anytime</span><h1 class="h2">${due.length} card${due.length === 1 ? '' : 's'} due</h1></div><a class="btn btn-sm btn-ghost" href="#/">Exit</a></div><div id="review-body"></div></div>`;
  };
  routes.review.after = () => {
    const L = routes.review.L, r = routes.review.r;
    const draw = () => { $('#review-body').innerHTML = renderReview(L, r); wireReview(L, r, draw); const n = $('#next'); if (n) n.onclick = () => { location.hash = '#/'; }; };
    draw(); document.addEventListener('keydown', reviewKeys);
  };
  function reviewKeys(e) {
    if (e.target.matches('input,textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') { const b = $('#reveal'); if (b) { e.preventDefault(); b.click(); } }
    const g = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key]; if (g !== undefined) { const b = $(`[data-grade="${g}"]`); if (b) b.click(); }
  }

  /* ------------------------------------------------------------ LIBRARY */
  routes.library = function (arg) {
    const tab = arg || 'characters';
    const today = todayDay();
    const charDay = {}; DAYS.forEach(d => d.chars.forEach(c => { charDay[c.h] = d.day; }));
    const wordDay = {}; DAYS.forEach(d => d.words.forEach(w => { wordDay[w.w] = d.day; }));
    const sentDay = {}; DAYS.forEach(d => d.sentences.forEach(s => { sentDay[s.zh] = d.day; }));
    return `<div class="stack">
      <div class="row between"><div><span class="eyebrow">Library</span><h1 class="h2">Everything in the forest</h1></div>
        <div class="row">${['characters', 'words', 'sentences', 'grammar', 'props'].map(t => `<a class="btn btn-sm${t === tab ? ' btn-primary' : ''}" href="#/library/${t}">${t}</a>`).join('')}</div></div>
      <input class="input" id="search" placeholder="Search hanzi, pinyin or English…" autocomplete="off">
      <div id="lib">
      ${tab === 'characters' ? `<div class="grid grid-tiles">${S.CHARACTERS.map(c => `<button class="tile" data-open="${c.h}" data-q="${esc((c.h + ' ' + c.p + ' ' + c.m + ' ' + S.parsePinyin(c.p).base).toLowerCase())}" style="${charDay[c.h] > today ? 'opacity:.55' : ''}"><span class="hz">${c.h}</span><span class="py ${toneClass(c.p)}">${esc(c.p)}</span><span class="small muted">${esc(c.m)}</span><span class="faint small">HSK ${c.level} · day ${charDay[c.h]}</span></button>`).join('')}</div>` : ''}
      ${tab === 'words' ? `<table class="table"><tbody>${S.WORDS.map(w => `<tr data-q="${esc((w.w + ' ' + w.p + ' ' + w.m).toLowerCase())}"><td class="mid-hz">${w.w}</td><td class="py">${pinyinHTML(w.p)}</td><td>${esc(w.m)}</td><td class="faint small">day ${wordDay[w.w] || '—'}</td><td>${playBtn(w.w)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${tab === 'sentences' ? `<div class="stack">${S.SENTENCES.map(s => `<div class="sentence" data-q="${esc((s.zh + ' ' + s.p + ' ' + s.en).toLowerCase())}"><div class="row between"><span class="mid-hz">${esc(s.zh)}</span><span class="row"><span class="faint small">day ${sentDay[s.zh] || '—'}</span>${playBtn(s.zh)}${playBtn(s.zh, { slow: true, rate: 0.6 })}${sayBtn(s.zh)}</span></div><div class="py">${pinyinHTML(s.p)}</div><div class="en">${esc(s.en)}</div></div>`).join('')}</div>` : ''}
      ${tab === 'grammar' ? `<div class="stack">${S.GRAMMAR.map(g => `<div class="sentence" data-q="${esc((g.name + ' ' + g.pattern + ' ' + g.zh + ' ' + g.en).toLowerCase())}"><div class="row between"><b>${esc(g.name)} <span class="muted">· HSK ${g.level}</span></b><span class="row">${playBtn(g.zh)}</span></div><div>${esc(g.pattern)}</div><div><span class="hz" style="font-size:1.2rem">${esc(g.zh)}</span> <span class="py">${pinyinHTML(g.p)}</span> <span class="muted small">${esc(g.en)}</span></div><div class="small muted">${esc(g.note)}</div></div>`).join('')}</div>` : ''}
      ${tab === 'props' ? `<div class="grid grid-tiles">${S.COMPONENTS.map(c => `<div class="tile" data-q="${esc((c.c + ' ' + c.k + ' ' + c.prop).toLowerCase())}"><span class="hz">${c.c}</span><b>${esc(c.k)}</b><span class="small muted">${esc(S.resolveCast(state.cast).prop(c.c))}</span></div>`).join('')}</div>` : ''}
      </div></div>`;
  };
  routes.library.after = () => {
    $('#search').oninput = e => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('#lib [data-q]').forEach(el => { el.style.display = !q || el.dataset.q.includes(q) ? '' : 'none'; }); };
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openChar(b.dataset.open));
  };
  function openChar(h) {
    const ch = S.CHARACTERS.find(c => c.h === h); if (!ch) return;
    const sc = S.scene(ch, state.cast);
    const words = S.WORDS.filter(w => w.w.includes(h)).slice(0, 8);
    const sents = S.SENTENCES.filter(s => s.zh.includes(h)).slice(0, 4);
    const srs = state.srs['c:' + h];
    openDialog(`<div class="row between"><span class="eyebrow">${esc(sc.actor)} · ${esc(sc.set)} · ${esc(sc.room)}</span><button class="btn btn-sm btn-ghost" data-close>✕</button></div>
      <div class="grid" style="grid-template-columns:auto 1fr;gap:1rem;align-items:center"><div class="big-hz" style="font-size:5rem">${ch.h}</div><div><div class="py ${toneClass(ch.p)}" style="font-size:1.6rem">${esc(ch.p)}</div><div style="font-weight:700">${esc(ch.m)}</div><div class="row">${playBtn(ch.h)}${playBtn(ch.h, { slow: true, rate: 0.6 })}${sayBtn(ch.h)}<button class="btn btn-sm" data-write="${ch.h}" title="Stroke order">✍️ Write</button></div></div></div>
      <div class="props">${sc.props.map(p => `<span class="chip"><span class="hz">${p.c}</span> ${esc(p.keyword)} → ${esc(p.prop)}</span>`).join('')}</div>
      <div class="scene">${esc(state.scenes[h] || sc.text)}</div>
      <textarea class="input" data-scene="${h}" placeholder="Rewrite this scene in your own words">${esc(state.scenes[h] || '')}</textarea>
      ${words.length ? `<div><span class="eyebrow">Words</span>${words.map(w => `<div class="row between"><span><span class="hz" style="font-size:1.3rem">${w.w}</span> <span class="py">${pinyinHTML(w.p)}</span> <span class="muted small">${esc(w.m)}</span></span>${playBtn(w.w)}</div>`).join('')}</div>` : ''}
      ${sents.length ? `<div><span class="eyebrow">Sentences</span>${sents.map(s => `<div class="row between"><span><span class="hz">${esc(s.zh)}</span> <span class="muted small">${esc(s.en)}</span></span>${playBtn(s.zh)}</div>`).join('')}</div>` : ''}
      <p class="faint small">${srs ? `Reviewed ${srs.reps} time${srs.reps === 1 ? '' : 's'} · next due ${new Date(srs.due).toLocaleDateString()} · interval ${srs.ivl} d` : 'Not yet in your review deck.'}</p>`);
    $('#dialog [data-scene]').oninput = e => { state.scenes[h] = e.target.value.trim(); save(); };
  }

  /* ------------------------------------------------------------ CAST */
  routes.cast = function () {
    const c = S.resolveCast(state.cast);
    return `<div class="stack-lg">
      <div><span class="eyebrow">Cast</span><h1 class="h2">Your actors, sets, rooms and props</h1><p class="lead">Every Mandarin syllable is an actor (initial) in a set (final), standing in a room (tone). Use people and places you can picture instantly — the memory does the rest. Changes save automatically.</p></div>
      <section class="card stack"><h2 class="h3">Actors — initials</h2><table class="table"><thead><tr><th>Initial</th><th>Example</th><th>Your actor</th></tr></thead><tbody>
        ${S.PINYIN.initials.map(i => `<tr><td><b class="py">${esc(i.key)}-</b><br><span class="small muted">${esc(i.hint)}</span></td><td class="small">${esc(i.ex)} ${playBtn(i.ex.split(' ')[1] || '')}</td><td><input class="input" data-cast="actors" data-key="${esc(i.key)}" value="${esc(c.actor(i.key))}"></td></tr>`).join('')}</tbody></table></section>
      <section class="card stack"><h2 class="h3">Sets — finals</h2><table class="table"><thead><tr><th>Final</th><th>Example</th><th>Your place</th></tr></thead><tbody>
        ${S.PINYIN.finals.map(f => `<tr><td><b class="py">-${esc(f.key)}</b><br><span class="small muted">${esc(f.hint)}</span></td><td class="small">${esc(f.ex)} ${playBtn(f.ex.split(' ')[1] || '')}</td><td><input class="input" data-cast="sets" data-key="${esc(f.key)}" value="${esc(c.set(f.key))}"></td></tr>`).join('')}</tbody></table></section>
      <section class="card stack"><h2 class="h3">Rooms — tones</h2><p class="muted small">The same five rooms exist in every set. Pick rooms every one of your places has.</p><table class="table"><tbody>
        ${S.PINYIN.tones.map(t => `<tr><td>${toneSVG(t.n)}</td><td><b>${esc(t.name)}</b><br><span class="small muted">${esc(t.hint)}</span></td><td><input class="input" data-cast="rooms" data-key="${t.n}" value="${esc(c.room(t.n))}"></td></tr>`).join('')}</tbody></table></section>
      <section class="card stack"><h2 class="h3">Props — components</h2><input class="input" id="propsearch" placeholder="Filter props…"><div class="grid grid-tiles" id="props">
        ${S.COMPONENTS.map(p => `<div class="tile" data-q="${esc((p.c + ' ' + p.k + ' ' + c.prop(p.c)).toLowerCase())}"><span class="hz">${p.c}</span><b class="small">${esc(p.k)}</b><input class="input" data-cast="props" data-key="${p.c}" value="${esc(c.prop(p.c))}"></div>`).join('')}</div></section>
      <div class="row"><button class="btn btn-ghost" id="resetcast">Reset to defaults</button></div>
    </div>`;
  };
  routes.cast.after = () => {
    document.querySelectorAll('[data-cast]').forEach(i => i.oninput = () => { state.cast[i.dataset.cast][i.dataset.key] = i.value.trim(); save(); });
    $('#propsearch').oninput = e => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('#props [data-q]').forEach(el => el.style.display = !q || el.dataset.q.includes(q) ? '' : 'none'); };
    $('#resetcast').onclick = () => { if (confirm('Reset all actors, sets, rooms and props to the defaults?')) { state.cast = { actors: {}, sets: {}, rooms: {}, props: {} }; save(); navigate(); } };
  };

  /* ------------------------------------------------------------ PROGRESS */
  routes.progress = function () {
    const today = todayDay(); const done = state.progress.completed;
    const total = Object.keys(done).length; const st = S.curriculumStats(DAYS);
    const rv = state.progress.reviews, qz = state.progress.quiz;
    const cells = []; const start = Math.max(1, today - 90);
    for (let d = start; d <= today + 6; d++) cells.push(`<i class="${done[d] ? 'on' : d < today ? 'missed' : d > today ? 'future' : ''}${d === today ? ' today' : ''}" title="Day ${d} · ${fmtDate(S.dateForDay(d, state.settings.startDate))}${done[d] ? ' · done' : ''}"></i>`);
    const learned = S.learnedItems(DAYS, Math.min(today, DAYS.length)).filter(i => done[i.day]);
    const due = Object.entries(state.srs).filter(([, s]) => s.due <= Date.now()).length;
    const mature = Object.values(state.srs).filter(s => s.ivl >= 21).length;
    return `<div class="stack-lg">
      <div><span class="eyebrow">Progress</span><h1 class="h2">Your forest</h1></div>
      <section class="grid grid-3">
        <div class="card stat"><b>${streak()}</b><span>day streak</span></div>
        <div class="card stat"><b>${total} / ${st.days}</b><span>lessons completed</span></div>
        <div class="card stat"><b>${learned.filter(i => i.type === 'c').length}</b><span>characters · ${learned.filter(i => i.type === 'w').length} words · ${learned.filter(i => i.type === 's').length} sentences</span></div>
        <div class="card stat"><b>${due}</b><span>reviews due now · ${mature} mature (21 d+)</span></div>
        <div class="card stat"><b>${rv.total ? Math.round(rv.good / rv.total * 100) : 0}%</b><span>recall rate (${rv.total} reviews)</span></div>
        <div class="card stat"><b>${qz.total ? Math.round(qz.right / qz.total * 100) : 0}%</b><span>quiz accuracy (${qz.total} questions)</span></div>
        <div class="card stat"><b>${(state.progress.tones || { total: 0 }).total ? Math.round(state.progress.tones.right / state.progress.tones.total * 100) : 0}%</b><span>tone gym (${(state.progress.tones || { total: 0 }).total} reps) · <a href="#/tones" style="text-decoration:underline">train</a></span></div>
        <div class="card stat"><b>${(state.progress.writes || { total: 0 }).total}</b><span>characters written by hand · ${(state.talks || []).length} tutor sessions</span></div>
      </section>
      <section class="card stack"><h2 class="h3">Your forest</h2><div class="forest">${forestSVG(total) || '<span class="small muted">Plant your first tree today.</span>'}</div></section>
      <section class="card stack"><h2 class="h3">Last 90 days</h2><div class="heatmap">${cells.join('')}</div><p class="faint small">Green = done · red = missed · gold ring = today. Missed days stay open under Today → Catch-up.</p></section>
      <section class="card stack"><h2 class="h3">Milestones</h2><ul class="stack small" style="gap:.4rem">
        ${[[12, 'Pronunciation Mastery complete — every sound has an actor and a set'], [13, 'First tree planted: 木 林 森']].concat(st.levels.map(l => [l.lastDay, `${l.name} complete: ${l.characters} characters, ${l.words} words, ${l.sentences} sentences`])).map(([d, t]) => `<li>${done[d] ? '✅' : d <= today ? '⬜' : '🔒'} <b>Day ${d}</b> — ${esc(t)}</li>`).join('')}</ul></section>
    </div>`;
  };

  /* ------------------------------------------------------------ LEVELS */
  routes.levels = function () {
    const info = S.LEVELINFO; const ls = levelStatus(); const start = S.parseISO(state.settings.startDate);
    const perDay = state.settings.charsPerDay;
    return `<div class="stack-lg">
      <div><span class="eyebrow">The ladder</span><h1 class="h2">What each HSK level means, and when you reach it</h1><p class="lead">${esc(info.about)}</p></div>
      <div class="card stack"><div class="row between"><b>Your road at ${perDay} characters a day, starting ${esc(fmtDate(start))}</b><a class="btn btn-sm" href="#/settings">change pace</a></div>
        <div class="table-scroll"><table class="table"><thead><tr><th>Level</th><th class="hide-sm">CEFR</th><th>Words</th><th class="hide-sm">Typical study hours</th><th>SenLin days</th><th>Target date</th><th>Status</th></tr></thead><tbody>
        ${ls.map(l => { const i = info.levels.find(x => x.level === l.level); return `<tr${l.status === 'current' ? ' style="background:var(--accent-soft)"' : ''}><td><b>${esc(l.name)}</b><span class="muted small show-sm"> · ${esc(i.cefr)}</span></td><td class="hide-sm">${esc(i.cefr)}</td><td>${i.cumWords.toLocaleString()}<span class="hide-sm"> total</span></td><td class="hide-sm">${i.hours[0]}–${i.hours[1]} h</td><td>Day ${l.start}–${l.end} <span class="muted small">(${monthsBetween(S.dateForDay(1, state.settings.startDate), l.endDate)} mo)</span></td><td>${esc(fmtDateY(l.endDate))}</td><td>${l.status === 'done' ? '✅ done' : l.status === 'current' ? `🟢 ${l.completed}/${l.total}` : '🔒'}</td></tr>`; }).join('')}
        </tbody></table></div>
        <p class="small muted">“Typical study hours” are the ranges Hanban and university programmes cite for classroom learners. SenLin’s ten-minute lessons cover the vocabulary and grammar on the dates above; the Talk, Tone gym, Write and Deal Desk sessions on top of them are what turn that into the hours of real practice each level needs.</p></div>
      ${info.levels.map(i => { const l = ls.find(x => x.level === i.level); return `<section class="card stack">
        <div class="row between"><div><span class="eyebrow">${esc(i.name)} · ${esc(i.cefr)} · ${i.words} new words (${i.cumWords.toLocaleString()} cumulative)</span><h2 class="h3">${esc(i.canDo.split('.')[0])}.</h2></div><span class="chip${l.status === 'done' ? ' chip-accent' : l.status === 'current' ? ' chip-gold' : ''}">${l.status === 'done' ? 'complete' : l.status === 'current' ? 'in progress' : 'from ' + esc(fmtDate(l.startDate))}</span></div>
        <p class="muted">${esc(i.canDo)}</p>
        <div class="grid grid-2"><div><b>The exam</b><p class="small muted">${esc(i.exam)}</p></div><div><b>Official textbook</b><p class="small muted">${esc(i.book)}. Study hours: ${i.hours[0]}–${i.hours[1]}. In SenLin: days ${l.start}–${l.end} (${l.total} lessons, ${esc(fmtDateY(l.startDate))} → ${esc(fmtDateY(l.endDate))}).</p></div></div>
        <details class="small"><summary class="muted">Units and topics this level covers</summary><ul class="stack" style="gap:.25rem;margin-top:.5rem">${i.topics.map(t => `<li>· ${esc(t)}</li>`).join('')}</ul></details>
      </section>`; }).join('')}
      <p class="small muted">${esc(info.note30)}</p>
    </div>`;
  };

  /* ------------------------------------------------------------ DEAL DESK */
  routes.business = function (arg) {
    const B = S.BUSINESS; const unit = B.units.find(u => u.id === arg);
    if (unit) return `<div class="stack-lg">
      <div class="row between"><div><span class="eyebrow">Deal Desk · ${esc(unit.en)}</span><h1 class="h2"><span class="hz">${esc(unit.title)}</span></h1><p class="lead">${esc(unit.brief)}</p></div><a class="btn btn-sm btn-ghost" href="#/business">← all units</a></div>
      <section class="card stack"><h2 class="h3">Terms</h2>${unit.terms.map(t => `<div class="row between"><div><span class="mid-hz">${esc(t.w)}</span> <span class="py">${pinyinHTML(t.p)}</span> <span class="muted">${esc(t.m)}</span>${t.note ? `<div class="small muted">${esc(t.note)}</div>` : ''}</div><span class="row">${playBtn(t.w)}${sayBtn(t.w)}<button class="btn btn-sm" data-addword="${esc(JSON.stringify({ w: t.w, p: t.p, m: t.m }))}">＋ deck</button></span></div>`).join('')}</section>
      <section class="card stack"><h2 class="h3">Phrases that move a deal</h2>${unit.phrases.map(x => `<div class="sentence" style="border-left-color:var(--sky-500)"><div class="row between"><span class="hz" style="font-size:1.3rem">${esc(x.zh)}</span><span class="row">${playBtn(x.zh)}${playBtn(x.zh, { slow: true, rate: 0.6 })}${sayBtn(x.zh)}</span></div><div class="py">${pinyinHTML(x.p)}</div><div class="muted">${esc(x.en)}</div>${x.note ? `<div class="small faint">${esc(x.note)}</div>` : ''}</div>`).join('')}</section>
      <div class="row"><a class="btn btn-primary" href="#/talk/biz-${unit.id === 'terms' ? 'terms' : unit.id === 'dd' ? 'dd' : unit.id === 'closing' || unit.id === 'legal' ? 'closing' : unit.id === 'banquet' ? 'banquet' : unit.id === 'fund' ? 'lp' : 'intro'}">Practise this live with the tutor</a></div>
    </div>`;
    const today = todayDay(); const desk = S.dealDesk(today, S.CONFIG.businessStartDay);
    return `<div class="stack-lg">
      <div><span class="eyebrow">Deal Desk · 交易台</span><h1 class="h2">Mandarin for cross-border private equity and venture deals</h1><p class="lead">${esc(B.intro)}</p></div>
      ${desk ? `<section class="card card-accent stack"><span class="eyebrow">Today’s deal desk · cycle ${desk.cycle}</span><div class="row">${desk.terms.map(t => `<span class="chip chip-gold"><span class="hz">${esc(t.w)}</span> ${esc(t.p)} · ${esc(t.m)}</span>`).join('')}</div><div class="hz" style="font-size:1.3rem">${esc(desk.phrase.zh)}</div><div class="muted">${esc(desk.phrase.p)} — ${esc(desk.phrase.en)}</div></section>` : ''}
      <div class="grid grid-3">${B.units.map((u, i) => `<a class="tile" href="#/business/${u.id}"><span class="faint small">Unit ${i + 1}</span><span class="hz" style="font-size:1.5rem">${esc(u.title)}</span><b>${esc(u.en)}</b><span class="small muted">${u.terms.length} terms · ${u.phrases.length} phrases</span></a>`).join('')}</div>
      <section class="card stack"><h2 class="h3">Worked dialogues</h2>${B.dialogues.map(d => `<details><summary><b>${esc(d.en)}</b> <span class="hz muted">${esc(d.title)}</span></summary><div class="stack" style="margin-top:.6rem">${d.lines.map(l => `<div class="sentence" style="border-left-color:var(--grape-500)"><div class="row between"><span><span class="faint small">${esc(l.who)}</span><br><span class="hz" style="font-size:1.2rem">${esc(l.zh)}</span></span><span class="row">${playBtn(l.zh)}${sayBtn(l.zh)}</span></div><div class="py small">${pinyinHTML(l.p)}</div><div class="muted small">${esc(l.en)}</div></div>`).join('')}</div></details>`).join('')}</section>
      <section class="card stack"><h2 class="h3">Live deal-room practice</h2><p class="muted small">Six role-plays with the AI tutor: first meeting, LP pitch, term-sheet negotiation, diligence call, closing call and the banquet. The tutor uses real deal vocabulary at your level and corrects every turn.</p><div class="row">${(window.SENLIN_SCENARIOS || []).filter(x => x.track === 'business').map(x => `<a class="btn btn-sm" href="#/talk/${x.id}">${esc(x.en)}</a>`).join('')}</div></section>
    </div>`;
  };
  routes.business.after = () => { document.querySelectorAll('[data-addword]').forEach(b => b.onclick = () => { if (window.SenLinApp.addWord) { window.SenLinApp.addWord(JSON.parse(b.dataset.addword)); b.textContent = '✓ in deck'; } }); };

  /* ------------------------------------------------------------ METHOD */
  routes.method = function () {
    return `<div class="prose stack">
      <div><span class="eyebrow">The method</span><h1 class="h2">The SenLin Way</h1><p class="lead">森林 sēnlín means forest. 木 is a tree; two make woods (林); three make a forest (森). That is the whole philosophy: one small tree, every single day, compounding.</p></div>
      <h2 class="h3">Seven pillars, borrowed from the best</h2>
      <p><b>1 · Pronunciation before everything.</b> The first twelve days teach nothing but sound: every initial, every final, the four tones and the neutral tone, then all twenty tone pairs and the sandhi rules. A bad accent fossilises if you start with vocabulary, so the ear and mouth come first.</p>
      <p><b>2 · Movie scenes for characters.</b> The SenLin memory system, built on Heisig’s <i>Remembering the Hanzi</i> and the ancient memory palace. Each initial is an <b>actor</b>, each final is a <b>set</b> (a real place you know), each tone is a <b>room</b> inside that set, and each component is a <b>prop</b>. Every character becomes one vivid scene, which means the pronunciation, tone, shape and meaning are all stored together and retrieved together.</p>
      <p><b>3 · Top-down, never bottom-up.</b> You never meet a word before you own every character in it, and never a sentence before you own every word. The scheduler enforces this automatically, so nothing you study is ever built on sand.</p>
      <p><b>4 · Spaced repetition you grade yourself.</b> Reviews follow the SM-2 algorithm (the engine behind Anki and SuperMemo): each card returns just before you would forget it. Grade honestly — “Again” is information, not failure.</p>
      <p><b>5 · Shadowing.</b> From Alexander Argüelles and the Pimsleur tradition: speak <i>with</i> the native voice, matching rhythm and tone, three passes per sentence. The site uses your device’s Mandarin voice, so every character, word and sentence can be heard instantly, at normal or slow speed.</p>
      <p><b>6 · Comprehensible input only.</b> Every sentence is built from characters you have already planted (Krashen’s i+1). Understanding first; grammar arrives by pattern, not by rule.</p>
      <p><b>7 · Ten minutes, daily, with a timer.</b> Habit research (Fogg, Clear) is unanimous: small, fixed, daily beats long and occasional. The lesson is segmented — 1 min warm-up, 2½ review, 3½ new, 2 shadowing, 1 quiz — and a visible clock keeps you honest. Missed days never expire; they queue under Catch-up.</p>
      <h2 class="h3">The road</h2>
      <ul>
        <li><b>Days 1–12 · Pronunciation Mastery.</b> Sounds, tones, tone pairs, and casting your actors, sets and props.</li>
        ${(() => { const st = S.curriculumStats(DAYS); let start = 13; return st.levels.map(l => { const li = `<li><b>Days ${start}–${l.lastDay} · Phase ${l.level}, ${esc(l.name)}.</b> ${l.characters} characters, ${l.words} words and ${l.sentences} sentences, each unlocking exactly when you are ready for it.</li>`; start = l.lastDay + 1; return li; }).join(''); })()}
        <li><b>After the last level · Consolidation.</b> Daily review keeps the forest alive. HSK 6 is the ceiling of the standard test: at three characters a day the full road is about ${Math.round((S.CHARACTERS.length / 3 + 12) / 30)} months of ten-minute lessons, and you can raise the pace in Settings.</li>
      </ul>
      <h2 class="h3">Levels and the Deal Desk</h2>
      <p>The six phases are aligned with the published HSK 2.0 vocabulary lists (every listed word is taught, at its listed level) and mirror the unit structure of the <i>HSK Standard Course</i> textbooks. The <a href="#/levels" style="text-decoration:underline">Levels</a> page defines each level, its exam and the date you reach it at your pace. The <a href="#/business" style="text-decoration:underline">Deal Desk</a> is a parallel track for cross-border private-equity and venture work: two terms and one closing phrase join every lesson, and six deal-room role-plays live in Talk.</p>
      <h2 class="h3">Credits</h2>
      <p class="small muted">The SenLin Way is an original curriculum. It stands on the shoulders of James Heisig (component mnemonics), Paul Pimsleur (graduated recall), Piotr Woźniak (SM-2 spaced repetition), Stephen Krashen (comprehensible input) and Alexander Argüelles (shadowing), and on the published HSK vocabulary lists. Character decompositions are mnemonic-level approximations chosen for memorability. Stroke-order animations use the open-source <a href="https://hanziwriter.org" rel="noopener" target="_blank" style="text-decoration:underline">Hanzi Writer</a> library and Make Me a Hanzi data. HSK is a trademark of its owners; this course is HSK-aligned and is not affiliated with or endorsed by them. <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a>.</p>
    </div>`;
  };

  /* ------------------------------------------------------------ SETTINGS */
  routes.settings = function (arg) {
    const s = state.settings;
    if (arg === 'dev') { s.developer = !s.developer; save(); toast(s.developer ? 'Developer options on' : 'Developer options off'); location.hash = '#/settings'; return ''; }
    const voices = tts.voices;
    return `<div class="stack-lg" style="max-width:640px">
      ${window.SenLinApp && window.SenLinApp.accountExtra ? window.SenLinApp.accountExtra() : ''}
      <div><span class="eyebrow">Settings</span><h1 class="h2">Make it yours</h1></div>
      <section class="card stack">
        <div class="field"><label for="start">Day 1 date</label><input class="input" type="date" id="start" value="${esc(s.startDate)}"><span class="faint small">Today is Day ${todayDay()}. Change this to restart or to shift the calendar.</span></div>
        <div class="field"><label for="pace">New characters per day</label><select class="input" id="pace">${[2, 3, 4, 5].map(n => `<option value="${n}"${s.charsPerDay === n ? ' selected' : ''}>${n} per day (${Math.ceil(S.CHARACTERS.length / n) + S.PINYIN.pronunciationDays.length} days for Phase 1)</option>`).join('')}</select></div>
        <div class="field"><label><input type="checkbox" id="biztoggle"${s.business ? ' checked' : ''}> Business track (Deal Desk) in every lesson</label><span class="faint small">Two PE/VC terms and one closing phrase a day, from Day 13. The full track lives under Deal Desk.</span></div>
        <div class="field"><label for="theme">Theme</label><select class="input" id="theme">${['auto', 'light', 'dark'].map(t => `<option value="${t}"${s.theme === t ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      </section>
      <section class="card stack">
        <h2 class="h3">Voice</h2>
        <div class="field"><label for="voicesource">Voice source</label><select class="input" id="voicesource">${[['auto', 'Best available: recorded audio, then device voice, then cloud voice'], ['recorded', 'Recorded audio first, device voice as backup'], ['device', 'Device voice only'], ['cloud', 'Cloud voice (needs an account)']].map(([v, l]) => `<option value="${v}"${(s.voiceSource || 'auto') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <span class="faint small">Best browsers: Chrome (desktop and Android) for both speaking and the microphone; Safari for speaking. The preview inside the Claude app has no speech engine, so it uses the online voice; the microphone needs Chrome.</span></div>
        <div class="field"><label for="voice">Mandarin voice</label><select class="input" id="voice"><option value="">Automatic${voices.length ? '' : ' (no Chinese voice found yet)'}</option>${voices.map(v => `<option value="${esc(v.name)}"${s.voice === v.name ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>
          <span class="faint small">No Chinese voice? macOS: System Settings → Accessibility → Spoken Content → add Tingting. Windows: Settings → Time & Language → add Chinese (Simplified) speech. Chrome also ships a Google 普通话 voice online.</span></div>
        <div class="field"><label for="rate">Speed: <span id="rateval">${s.rate}</span></label><input type="range" id="rate" min="0.5" max="1.2" step="0.05" value="${s.rate}"></div>
        <button class="btn" id="testvoice">Test: 你好，我是森林。</button>
      </section>
      <section class="card stack">
        <h2 class="h3">Your data</h2>
        <p class="muted small">Your progress lives in this browser. Sign in above to sync it across devices with automatic backups, or export a file here.</p>
        <div class="row"><button class="btn" id="export">Export backup</button><label class="btn">Import backup<input type="file" id="import" accept="application/json" class="sr-only"></label><button class="btn btn-ghost" id="reset" style="color:var(--vermilion)">Reset everything</button></div>
      </section>
      ${window.SenLinApp && window.SenLinApp.placementExtra ? window.SenLinApp.placementExtra() : ''}
      ${window.SenLinApp && window.SenLinApp.settingsExtra ? window.SenLinApp.settingsExtra() : ''}
      <section class="card card-soft stack">
        <h2 class="h3">Daily reminder</h2>
        ${window.SenLinApp && window.SenLinApp.reminderExtra ? window.SenLinApp.reminderExtra() : ''}
        <p class="small muted">Prefer a calendar? Add the 10-minute slot: <a href="daily.ics" download>daily.ics</a> (7:00 every day, with a link straight to that day’s lesson).</p>
      </section>
    </div>`;
  };
  routes.settings.after = () => {
    const s = state.settings;
    $('#start').onchange = e => { if (e.target.value) { s.startDate = e.target.value; save(); toast('Day 1 set to ' + s.startDate); } };
    $('#pace').onchange = e => { s.charsPerDay = +e.target.value; save(); rebuild(); toast('Pace updated'); };
    $('#theme').onchange = e => { s.theme = e.target.value; save(); applyTheme(); };
    $('#biztoggle').onchange = e => { s.business = e.target.checked; save(); toast(s.business ? 'Deal Desk on' : 'Deal Desk off'); };
    $('#voice').onchange = e => { s.voice = e.target.value; save(); };
    $('#voicesource').onchange = e => { s.voiceSource = e.target.value; save(); };
    $('#rate').oninput = e => { s.rate = +e.target.value; $('#rateval').textContent = s.rate; save(); };
    $('#testvoice').onclick = () => tts.speak('你好，我是森林。');
    $('#export').onclick = () => { const blob = new Blob([JSON.stringify({ settings: s, cast: state.cast, srs: state.srs, scenes: state.scenes, progress: state.progress }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `senlin-backup-${S.isoDate(new Date())}.json`; a.click(); };
    $('#import').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); Object.assign(state.settings, d.settings || {}); state.cast = d.cast || state.cast; state.srs = d.srs || state.srs; state.scenes = d.scenes || state.scenes; state.progress = d.progress || state.progress; save(); rebuild(); applyTheme(); toast('Backup restored'); navigate(); } catch (err) { toast('That file is not a SenLin backup'); } }; r.readAsText(f); };
    $('#reset').onclick = () => { if (confirm('Delete all progress, reviews, scenes and cast? This cannot be undone.')) { ['settings', 'cast', 'srs', 'scenes', 'progress', 'extra', 'talks'].forEach(k => localStorage.removeItem('senlin.' + k)); location.reload(); } };
    if (window.SenLinApp && window.SenLinApp.settingsExtraAfter) window.SenLinApp.settingsExtraAfter();
    if (window.SenLinApp && window.SenLinApp.placementExtraAfter) window.SenLinApp.placementExtraAfter();
    if (window.SenLinApp && window.SenLinApp.accountExtraAfter) window.SenLinApp.accountExtraAfter();
    if (window.SenLinApp && window.SenLinApp.reminderExtraAfter) window.SenLinApp.reminderExtraAfter();
  };

  /* ------------------------------------------------------------ bridge for add-on modules (tutor.js) */
  /** Replace the learner's data (cloud pull / backup restore) and re-render. */
  function applyData(d) {
    if (!d) return;
    Object.assign(state.settings, d.settings || {});
    ['cast', 'srs', 'scenes', 'progress', 'extra', 'talks'].forEach(k => { if (d[k]) state[k] = d[k]; });
    save(); rebuild(); applyTheme(); navigate();
  }
  const snapshot = () => ({ settings: state.settings, cast: state.cast, srs: state.srs, scenes: state.scenes, progress: state.progress, extra: state.extra, talks: state.talks });
  window.SenLinApp = { routes, state, save, esc, tts, toast, pinyinHTML, sayBtn, playBtn, navigate, rebuild, applyData, snapshot, listenOnce, listenEngine, matchScore, DAYS: () => DAYS, todayDay, levelStatus, locked, settingsExtra: null, settingsExtraAfter: null, accountExtra: null, accountExtraAfter: null, reminderExtra: null, reminderExtraAfter: null, extraReviewItems: () => [], addWord: null };

  /* ------------------------------------------------------------ go */
  navigate();
  /* pull in HSK 4–6 in the background once the first screen is up, so Library and Levels are instant later */
  if (LAZY.pending) (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => { LAZY.load().then(() => { rebuild(); if (/^#\/(library|levels|progress|plan)/.test(location.hash)) navigate(); }).catch(() => {}); });
})();
