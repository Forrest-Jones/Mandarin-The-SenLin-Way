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
    settings: Object.assign({ startDate: S.CONFIG.startDate, charsPerDay: 3, rate: 0.85, voice: '', showPinyin: true, theme: 'auto' }, store.get('settings', {})),
    cast: store.get('cast', { actors: {}, sets: {}, rooms: {}, props: {} }),
    srs: store.get('srs', {}),
    scenes: store.get('scenes', {}),
    progress: Object.assign({ completed: {}, reviews: { total: 0, good: 0 }, quiz: { total: 0, right: 0 } }, store.get('progress', {}))
  };
  const save = () => { store.set('settings', state.settings); store.set('cast', state.cast); store.set('srs', state.srs); store.set('scenes', state.scenes); store.set('progress', state.progress); };
  const applyTheme = () => { if (state.settings.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', state.settings.theme); };
  applyTheme();

  let DAYS = S.buildSchedule({ charsPerDay: state.settings.charsPerDay });
  const rebuild = () => { DAYS = S.buildSchedule({ charsPerDay: state.settings.charsPerDay }); };
  const todayDay = () => S.dayNumber(new Date(), state.settings.startDate);
  const dayInfo = d => DAYS[Math.min(d, DAYS.length) - 1];

  /* ------------------------------------------------------------ speech */
  const tts = {
    voices: [],
    load() { this.voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(v => /^zh([-_]|$)/i.test(v.lang) || /chinese|mandarin|putonghua/i.test(v.name)); },
    best() {
      if (state.settings.voice) { const v = this.voices.find(v => v.name === state.settings.voice); if (v) return v; }
      const pref = ['Tingting', 'Xiaoxiao', 'Yunxi', 'Google 普通话', 'Huihui', 'Yaoyao', 'Kangkang', 'Lili', 'zh-CN'];
      for (const p of pref) { const v = this.voices.find(v => (v.name + ' ' + v.lang).includes(p)); if (v) return v; }
      return this.voices.find(v => /zh[-_]CN/i.test(v.lang)) || this.voices[0];
    },
    speak(text, rate) {
      if (!window.speechSynthesis) return toast('Speech is not supported in this browser');
      if (!this.voices.length) this.load();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = rate || state.settings.rate;
      const v = this.best(); if (v) u.voice = v; else toast('No Chinese voice installed — add one in your OS speech settings');
      speechSynthesis.speak(u);
    }
  };
  if (window.speechSynthesis) { tts.load(); speechSynthesis.onvoiceschanged = () => tts.load(); }
  const playBtn = (text, opts = {}) => `<button class="btn btn-icon${opts.cls ? ' ' + opts.cls : ''}" data-say="${esc(text)}"${opts.rate ? ` data-rate="${opts.rate}"` : ''} title="Listen" aria-label="Listen">${opts.slow ? '🐢' : '🔊'}</button>`;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]'); if (b) tts.speak(b.dataset.say, b.dataset.rate ? parseFloat(b.dataset.rate) : undefined);
  });

  /* ---- "Say it": speech recognition scores what you said against the target (Chrome, Edge, Android) */
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
  const sayBtn = target => ASR ? `<button class="btn btn-icon" data-listen="${esc(target)}" title="Say it — I’ll check" aria-label="Say it">🎤</button>` : '';
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-listen]'); if (!b) return;
    const target = b.dataset.listen; const out = b.parentElement.querySelector('.asr') || b.parentElement.appendChild(Object.assign(document.createElement('span'), { className: 'asr small' }));
    out.textContent = 'listening…'; b.disabled = true;
    let r; try { r = new ASR(); } catch (err) { out.textContent = 'speech recognition unavailable'; b.disabled = false; return; }
    r.lang = 'zh-CN'; r.interimResults = false; r.maxAlternatives = 5;
    r.onresult = ev => {
      const alts = Array.from(ev.results[0]).map(a => a.transcript);
      const best = alts.map(a => ({ a, s: matchScore(target, a) })).sort((x, y) => y.s - x.s)[0];
      const pct = Math.round(best.s * 100);
      state.progress.said = state.progress.said || { total: 0, good: 0 }; state.progress.said.total++; if (pct >= 80) state.progress.said.good++; save();
      out.innerHTML = `${pct >= 80 ? '✅' : pct >= 50 ? '🟡' : '❌'} heard “<span class="hz">${esc(best.a)}</span>” · ${pct}% match`;
    };
    r.onerror = ev => { out.textContent = ev.error === 'not-allowed' ? 'microphone blocked — allow it in the browser' : ev.error === 'no-speech' ? 'no speech heard' : 'error: ' + ev.error; };
    r.onend = () => { b.disabled = false; if (out.textContent === 'listening…') out.textContent = 'nothing heard'; };
    r.start();
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
  const learnedChars = () => S.learnedItems(DAYS, Math.min(todayDay(), DAYS.length)).filter(i => i.type === 'c' && state.progress.completed[i.day]).length;
  const dueCount = () => { const now = Date.now(); return Object.values(state.srs).filter(s => s.due <= now).length; };

  /* ------------------------------------------------------------ router */
  const routes = {};
  function navigate() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, arg] = hash.split('/');
    const view = routes[name || 'today'] || routes.today;
    document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.route === (name || 'today')) || (a.dataset.route === (name || 'today') ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
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
          <h1 class="h1">${done ? 'Today’s tree is planted. 🌳' : beyond ? 'Consolidation day' : esc(info.phase)}</h1>
          <div>${beyond ? '<p class="lead">You have completed the scheduled curriculum. Review is due — keep the forest alive.</p>' : preview}</div>
          <div class="row">
            <a class="btn btn-gold btn-lg" href="#/lesson/${Math.min(day, DAYS.length)}">${done ? 'Do it again' : 'Start the 10-minute lesson'}</a>
            ${dueCount() ? `<a class="btn btn-ghost" href="#/review" style="color:#fff;border-color:rgba(255,255,255,.4)">Review ${dueCount()} due cards</a>` : ''}
            <span class="muted">${streak()}-day streak</span>
          </div>
        </section>
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
            <div class="row"><a class="btn btn-sm" href="#/library">Browse the library</a><a class="btn btn-sm" href="#/plan">See all days</a></div>
          </div>
        </section>
      </div>`;
  };

  /* ------------------------------------------------------------ PLAN (all days) */
  routes.plan = function () {
    const today = todayDay();
    return `<div class="stack"><span class="eyebrow">Curriculum</span><h1 class="h2">Every day, at a glance</h1>
      <table class="table"><thead><tr><th>Day</th><th>Date</th><th>Phase</th><th>New</th><th></th></tr></thead><tbody>
      ${DAYS.map(d => `<tr${d.day === today ? ' style="background:var(--accent-soft)"' : ''}><td>${d.day}</td><td class="small muted">${fmtDate(S.dateForDay(d.day, state.settings.startDate))}</td><td class="small">${d.type === 'pron' ? esc(d.pron.title) : esc(d.phase)}</td>
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
    if (!L.chars.length) return `<div class="card stack" style="margin-top:1rem"><p class="lead">No new characters today — consolidation.</p><p class="muted">Pick three characters from the Library and re-tell their scenes out loud, from memory, before looking.</p><a class="btn" href="#/library">Open the library</a></div>` + (L.words.length ? renderWords(L.words) : '') + renderGrammar(L.grammar);
    return `<div class="stack" style="margin-top:1rem">
      <p class="muted small">For each character: look, listen, then close your eyes and <b>see the scene</b> for ten seconds. The actor gives you the initial, the set gives the final, the room gives the tone, the props give the shape.</p>
      ${L.chars.map(({ ch, scene: sc }) => `<div class="card stack" data-char="${ch.h}">
        <div class="row between"><span class="eyebrow">${esc(sc.initial || 'no initial')}- + -${esc(sc.final)} + tone ${sc.tone}</span><span class="chip">${esc(sc.actor)} · ${esc(sc.set)} · ${esc(sc.room)}</span></div>
        <div class="grid" style="grid-template-columns:auto 1fr;gap:1.2rem;align-items:center">
          <div class="big-hz">${ch.h}</div>
          <div class="stack" style="gap:.4rem">
            <div class="py ${toneClass(ch.p)}" style="font-size:1.8rem">${esc(ch.p)} ${toneSVG(sc.tone)}</div>
            <div style="font-size:1.15rem;font-weight:700">${esc(ch.m)}</div>
            <div class="row">${playBtn(ch.h)}${playBtn(ch.h, { slow: true, rate: 0.6 })}${sayBtn(ch.h)}</div>
          </div>
        </div>
        <div class="props">${sc.props.map(p => `<span class="chip"><span class="hz">${p.c}</span> ${esc(p.keyword)} → ${esc(p.prop)}</span>`).join('')}</div>
        <div class="scene">${esc(state.scenes[ch.h] || sc.text)}</div>
        <details class="small"><summary class="muted">Make it mine (edit the scene)</summary>
          <textarea class="input" data-scene="${ch.h}" placeholder="Rewrite the scene in your own words — the weirder and more vivid, the stickier.">${esc(state.scenes[ch.h] || sc.text)}</textarea></details>
      </div>`).join('')}
      ${L.words.length ? renderWords(L.words) : ''}
      ${renderGrammar(L.grammar)}
    </div>`;
  }
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
      <div class="card stack"><div class="big-hz" style="font-size:4rem">${esc(item.prompt)}</div><p style="text-align:center" class="muted">${esc(item.question)}</p>
        <div class="stack" style="gap:.5rem">${item.options.map(o => `<button class="quiz-opt" data-opt="${esc(o)}">${o === item.correct || item.question.includes('pronounced') ? pinyinHTML(o) : esc(o)}</button>`).join('')}</div>
        <div id="quiz-next"></div></div></div>`;
  }

  function renderDone() {
    const L = lesson.data; const wasDone = !!state.progress.completed[L.day];
    if (!wasDone) {
      state.progress.completed[L.day] = S.isoDate(new Date());
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
      <p class="muted">${Math.round(lesson.elapsed / 60)} min ${lesson.elapsed % 60} s · ${streak()}-day streak · ${learnedChars()} characters planted</p>
      <div class="progress-ring" style="--p:${pct}"><div>${pct}%</div></div>
      <p class="muted small">${nextDay <= DAYS.length ? `Tomorrow (Day ${nextDay}): ${dayInfo(nextDay).type === 'pron' ? esc(dayInfo(nextDay).pron.title) : dayInfo(nextDay).chars.map(c => c.h).join(' ') + ' + ' + dayInfo(nextDay).words.length + ' words'}` : 'The scheduled curriculum is complete — keep reviewing daily.'}</p>
      <div class="row" style="justify-content:center"><a class="btn btn-primary" href="#/">Back to Today</a><a class="btn" href="#/progress">Progress</a></div>
    </div>`;
  }
  function wireDone() { lesson.stop(); }

  function wireSegment(id) {
    const L = lesson.data;
    if (id === 'review') { wireReview(L, lesson.review, renderSegment); document.addEventListener('keydown', reviewKeys); }
    else document.removeEventListener('keydown', reviewKeys);
    document.querySelectorAll('[data-scene]').forEach(t => t.oninput = () => { state.scenes[t.dataset.scene] = t.value.trim(); save(); });
    document.querySelectorAll('[data-cast]').forEach(i => i.oninput = () => { state.cast[i.dataset.cast][i.dataset.key] = i.value.trim(); save(); });
    document.querySelectorAll('[data-reveal]').forEach(e => e.onclick = () => e.classList.remove('hidden'));
    document.querySelectorAll('[data-shadow]').forEach(b => b.onclick = () => { lesson.shadow[b.dataset.shadow] = +b.dataset.n; renderSegment(); });
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
    const learned = S.learnedItems(DAYS, Math.min(todayDay(), DAYS.length)).filter(i => state.progress.completed[i.day]);
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
      <div class="grid" style="grid-template-columns:auto 1fr;gap:1rem;align-items:center"><div class="big-hz" style="font-size:5rem">${ch.h}</div><div><div class="py ${toneClass(ch.p)}" style="font-size:1.6rem">${esc(ch.p)}</div><div style="font-weight:700">${esc(ch.m)}</div><div class="row">${playBtn(ch.h)}${playBtn(ch.h, { slow: true, rate: 0.6 })}${sayBtn(ch.h)}</div></div></div>
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
      </section>
      <section class="card stack"><h2 class="h3">Last 90 days</h2><div class="heatmap">${cells.join('')}</div><p class="faint small">Green = done · red = missed · gold ring = today. Missed days stay open under Today → Catch-up.</p></section>
      <section class="card stack"><h2 class="h3">Milestones</h2><ul class="stack small" style="gap:.4rem">
        ${[[12, 'Pronunciation Mastery complete — every sound has an actor and a set'], [13, 'First tree planted: 木 林 森']].concat(st.levels.map(l => [l.lastDay, `${l.name} complete: ${l.characters} characters, ${l.words} words, ${l.sentences} sentences`])).map(([d, t]) => `<li>${done[d] ? '✅' : d <= today ? '⬜' : '🔒'} <b>Day ${d}</b> — ${esc(t)}</li>`).join('')}</ul></section>
    </div>`;
  };

  /* ------------------------------------------------------------ METHOD */
  routes.method = function () {
    return `<div class="prose stack">
      <div><span class="eyebrow">The method</span><h1 class="h2">The SenLin Way</h1><p class="lead">森林 sēnlín means forest. 木 is a tree; two make woods (林); three make a forest (森). That is the whole philosophy: one small tree, every single day, compounding.</p></div>
      <h2 class="h3">Seven pillars, borrowed from the best</h2>
      <p><b>1 · Pronunciation before everything.</b> The first twelve days teach nothing but sound: every initial, every final, the four tones and the neutral tone, then all twenty tone pairs and the sandhi rules. This is Mandarin Blueprint’s “Pronunciation Mastery” principle: a bad accent fossilises if you start with vocabulary.</p>
      <p><b>2 · The movie method for characters.</b> Popularised by Mandarin Blueprint’s <i>Hanzi Movie Method</i>, building on Heisig’s <i>Remembering the Hanzi</i> and the ancient memory palace. Each initial is an <b>actor</b>, each final is a <b>set</b> (a real place you know), each tone is a <b>room</b> inside that set, and each component is a <b>prop</b>. Every character becomes one vivid scene, which means the pronunciation, tone, shape and meaning are all stored together and retrieved together.</p>
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
      <h2 class="h3">Credits</h2>
      <p class="small muted">This program is an original curriculum inspired by the publicly described methods of <a href="https://www.mandarinblueprint.com/" target="_blank" rel="noopener">Mandarin Blueprint</a> (Hanzi Movie Method, Pronunciation Mastery, top-down learning), James Heisig, Paul Pimsleur, Piotr Woźniak (SM-2), Stephen Krashen and Alexander Argüelles. It is not affiliated with any of them. Character decompositions are mnemonic-level approximations chosen for memorability.</p>
    </div>`;
  };

  /* ------------------------------------------------------------ SETTINGS */
  routes.settings = function () {
    const s = state.settings;
    const voices = tts.voices;
    return `<div class="stack-lg" style="max-width:640px">
      <div><span class="eyebrow">Settings</span><h1 class="h2">Make it yours</h1></div>
      <section class="card stack">
        <div class="field"><label for="start">Day 1 date</label><input class="input" type="date" id="start" value="${esc(s.startDate)}"><span class="faint small">Today is Day ${todayDay()}. Change this to restart or to shift the calendar.</span></div>
        <div class="field"><label for="pace">New characters per day</label><select class="input" id="pace">${[2, 3, 4, 5].map(n => `<option value="${n}"${s.charsPerDay === n ? ' selected' : ''}>${n} per day (${Math.ceil(S.CHARACTERS.length / n) + S.PINYIN.pronunciationDays.length} days for Phase 1)</option>`).join('')}</select></div>
        <div class="field"><label for="theme">Theme</label><select class="input" id="theme">${['auto', 'light', 'dark'].map(t => `<option value="${t}"${s.theme === t ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      </section>
      <section class="card stack">
        <h2 class="h3">Voice</h2>
        <div class="field"><label for="voice">Mandarin voice</label><select class="input" id="voice"><option value="">Automatic${voices.length ? '' : ' (no Chinese voice found yet)'}</option>${voices.map(v => `<option value="${esc(v.name)}"${s.voice === v.name ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>
          <span class="faint small">No Chinese voice? macOS: System Settings → Accessibility → Spoken Content → add Tingting. Windows: Settings → Time & Language → add Chinese (Simplified) speech. Chrome also ships a Google 普通话 voice online.</span></div>
        <div class="field"><label for="rate">Speed: <span id="rateval">${s.rate}</span></label><input type="range" id="rate" min="0.5" max="1.2" step="0.05" value="${s.rate}"></div>
        <button class="btn" id="testvoice">Test: 你好，我是森林。</button>
      </section>
      <section class="card stack">
        <h2 class="h3">Your data</h2>
        <p class="muted small">Everything lives in this browser (no account, no server). Export a backup before switching devices.</p>
        <div class="row"><button class="btn" id="export">Export backup</button><label class="btn">Import backup<input type="file" id="import" accept="application/json" class="sr-only"></label><button class="btn btn-ghost" id="reset" style="color:var(--vermilion)">Reset everything</button></div>
      </section>
      <section class="card card-soft stack">
        <h2 class="h3">Daily push</h2>
        <p class="small muted">Add the 10-minute slot to your calendar: <a href="daily.ics" download>daily.ics</a> (7:00 every day, with a link straight to that day’s lesson). A GitHub-hosted daily reminder is described in the repository README.</p>
      </section>
    </div>`;
  };
  routes.settings.after = () => {
    const s = state.settings;
    $('#start').onchange = e => { if (e.target.value) { s.startDate = e.target.value; save(); toast('Day 1 set to ' + s.startDate); } };
    $('#pace').onchange = e => { s.charsPerDay = +e.target.value; save(); rebuild(); toast('Pace updated'); };
    $('#theme').onchange = e => { s.theme = e.target.value; save(); applyTheme(); };
    $('#voice').onchange = e => { s.voice = e.target.value; save(); };
    $('#rate').oninput = e => { s.rate = +e.target.value; $('#rateval').textContent = s.rate; save(); };
    $('#testvoice').onclick = () => tts.speak('你好，我是森林。');
    $('#export').onclick = () => { const blob = new Blob([JSON.stringify({ settings: s, cast: state.cast, srs: state.srs, scenes: state.scenes, progress: state.progress }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `senlin-backup-${S.isoDate(new Date())}.json`; a.click(); };
    $('#import').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); Object.assign(state.settings, d.settings || {}); state.cast = d.cast || state.cast; state.srs = d.srs || state.srs; state.scenes = d.scenes || state.scenes; state.progress = d.progress || state.progress; save(); rebuild(); applyTheme(); toast('Backup restored'); navigate(); } catch (err) { toast('That file is not a SenLin backup'); } }; r.readAsText(f); };
    $('#reset').onclick = () => { if (confirm('Delete all progress, reviews, scenes and cast? This cannot be undone.')) { ['settings', 'cast', 'srs', 'scenes', 'progress'].forEach(k => localStorage.removeItem('senlin.' + k)); location.reload(); } };
  };

  /* ------------------------------------------------------------ go */
  navigate();
})();
