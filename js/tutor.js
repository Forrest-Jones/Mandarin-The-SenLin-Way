/* Mandarin The SenLin Way — live 1-on-1 AI tutor ("Talk")
   Two providers, same conversation:
   - inside the claude.ai artifact viewer: the built-in `sample` capability (no key, viewer's own account)
   - on the public site: the official Anthropic SDK loaded from the jsdelivr ESM CDN, with the
     learner's own API key stored only in this browser (Settings → AI tutor). */
(function () {
  'use strict';
  const A = window.SenLinApp; if (!A) return;
  const { routes, state, save, esc, tts, toast, pinyinHTML } = A;
  const S = window.SenLin;
  const SCENARIOS = window.SENLIN_SCENARIOS || [];
  const MODEL = 'claude-opus-5';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.127.0/+esm';

  /* ------------------------------------------------------------ providers */
  let samplePromise = null;
  const getSample = () => samplePromise || (samplePromise = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('sample').catch(() => null) : Promise.resolve(null));
  let sdkPromise = null;
  const getSDK = () => sdkPromise || (sdkPromise = import(SDK_URL).then(m => m.default || m.Anthropic || m).catch(err => { sdkPromise = null; throw err; }));
  const apiKey = () => (state.settings.apiKey || '').trim();

  const cloud = () => (window.SenLinCloud && window.SenLinCloud.signedIn()) ? window.SenLinCloud : null;
  async function providerName() {
    if (await getSample()) return 'artifact';
    if (cloud()) return 'cloud';
    if (apiKey()) return 'sdk';
    return null;
  }

  /** Stream one reply. `messages` = [{role, content}] ending on user. Calls onText(whole) as it streams. Returns full text. */
  async function complete(system, messages, onText, signal) {
    const sample = await getSample();
    if (sample) {
      const turns = [{ role: 'user', content: system }].concat(messages);
      const { text } = await sample(turns, { cache: false, signal, onText: ({ text }) => onText(text), modelTier: 'default' });
      return text;
    }
    if (cloud() && !apiKey()) return cloud().chat(system, messages, onText, signal);
    const key = apiKey(); if (!key) throw { code: 'no_key', message: window.SenLinCloud && window.SenLinCloud.available() ? 'Sign in (Settings) to talk with the tutor, or add your own API key' : 'No API key' };
    const Anthropic = await getSDK();
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const stream = client.beta.messages.stream({
      model: MODEL, max_tokens: 2048, system, messages,
      thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'
    }, { signal });
    let text = '';
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; onText(text); }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw { code: 'refused', message: 'The model declined this request.' };
    return text;
  }

  /* ------------------------------------------------------------ prompt */
  const FORMAT = `Reply in EXACTLY this 5-line format and nothing else:
ZH: <your reply in Chinese, 1–2 short spoken sentences>
PY: <the same in pinyin with tone marks>
EN: <English translation>
FIX: <if the learner's last message had a mistake: the corrected Chinese, then " — " and a one-line English explanation; if it was fine: ✓; if they wrote in English: a natural Chinese way to say it>
NEW: <words in your reply the learner may not know, as 词|pinyin|meaning separated by ; or - if none>`;

  function systemPrompt(sc, level, known) {
    if (sc.track === 'business') return `You are 森林老师 (Sēnlín lǎoshī), a Mandarin coach for cross-border private-equity and venture-capital professionals, running a live 1-on-1 deal-room role-play with a learner at HSK ${level}.
Scenario: ${sc.en} (${sc.title}). Setting: ${sc.setting}. You play: ${sc.persona}. The learner's goal: ${sc.goal}
Stay in character as a Chinese business counterpart: formal register (您, titles like 王总), natural Mandarin as used in Chinese finance (基金, 估值, 尽调, 条款, 交割, 优先清算权, 对赌, 备案, 结汇…). Business terms may exceed HSK ${level}; use them, but keep sentence structure at the learner's level and put every finance term in the NEW line with pinyin and meaning. Keep replies to 1–3 sentences and always push the deal forward with a question, a counter-offer or a next step, the way a real counterparty would. Correct the learner's Chinese in the FIX line, including register mistakes (too casual, missing 您/title). If they write English, answer in Chinese and show them the Chinese way to say it. Never break the 5-line format.
${FORMAT}`;
    return `You are 森林老师 (Sēnlín lǎoshī), a warm, patient Mandarin tutor running a live 1-on-1 role-play with a learner at HSK ${level}.
Scenario: ${sc.en} (${sc.title}). Setting: ${sc.setting}. You play: ${sc.persona}. The learner's goal: ${sc.goal}
Stay in character and speak natural spoken Mandarin (simplified characters). Keep every reply to 1–2 short sentences and always end with a question or a prompt so the learner keeps talking. Match HSK ${level}: prefer these characters the learner already knows: ${known}. Introduce at most one new word per turn. If the learner makes a mistake, keep the conversation going but correct it in the FIX line. If the learner writes in English, gently answer in Chinese and show them how to say it. Never break the 5-line format, never add commentary.
${FORMAT}`;
  }

  /** Parse the 5-line reply, tolerant of partial (streaming) text. */
  function parseReply(text) {
    const out = { zh: '', py: '', en: '', fix: '', words: [] };
    const grab = k => { const m = text.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); return m ? m[1].trim() : ''; };
    out.zh = grab('ZH'); out.py = grab('PY'); out.en = grab('EN'); out.fix = grab('FIX');
    const nw = grab('NEW');
    if (nw && nw !== '-' && nw !== '—') out.words = nw.split(/[;；]/).map(s => s.split('|').map(x => x.trim())).filter(a => a.length >= 2 && /\p{Script=Han}/u.test(a[0])).map(a => ({ w: a[0], p: a[1] || '', m: a[2] || '' }));
    if (!out.zh) out.zh = text.replace(/^ZH:\s*/, '').split('\n')[0];
    return out;
  }

  /* ------------------------------------------------------------ session state */
  const T = { sc: null, turns: [], busy: false, ctl: null, handsFree: false, showEn: true, level: 1, known: '', startedAt: 0 };
  state.talks = state.talks || [];

  function learnedCharacters() {
    const days = A.DAYS(); const today = A.todayDay();
    const done = state.progress.completed;
    let chars = S.learnedItems(days, Math.min(today, days.length)).filter(i => i.type === 'c' && done[i.day]).map(i => i.ref.h);
    if (chars.length < 30) chars = S.CHARACTERS.filter(c => c.level === 1).map(c => c.h);   // beginner: assume HSK 1
    return chars;
  }
  function currentLevel(chars) {
    const set = new Set(chars); let lvl = 1;
    for (const L of S.LEVELS) { const own = L.characters.filter(c => set.has(c.h)).length; if (own >= L.characters.length * 0.6) lvl = L.level; }
    return lvl;
  }

  /* ------------------------------------------------------------ route: /talk */
  routes.talk = function (arg) {
    if (arg && SCENARIOS.find(s => s.id === arg)) { startSession(SCENARIOS.find(s => s.id === arg)); return `<div id="talk"></div>`; }
    const chars = learnedCharacters(); const lvl = currentLevel(chars);
    return `<div class="stack-lg">
      <div><span class="eyebrow">Talk · live 1-on-1</span><h1 class="h2">Practice with 森林老师</h1>
        <p class="lead">Real conversation, in real time. Type or speak; the tutor answers in Chinese, shows pinyin and English, corrects your mistakes, and keeps you talking. Vocabulary is matched to what you have learned (about HSK ${lvl} right now).</p></div>
      <div id="talk-status" class="card card-soft small muted">Checking AI availability…</div>
      <div class="grid grid-3">${SCENARIOS.filter(s => !s.track).map(s => `<a class="tile" href="#/talk/${s.id}" style="${s.minLevel > lvl ? 'opacity:.6' : ''}"><span class="hz" style="font-size:1.6rem">${esc(s.title)}</span><b>${esc(s.en)}</b><span class="small muted">${esc(s.goal)}</span><span class="faint small">from HSK ${s.minLevel}${s.minLevel > lvl ? ' · stretch' : ''}</span></a>`).join('')}</div>
      <div><span class="eyebrow">Deal room · business track</span><h2 class="h3">Close the deal in Mandarin</h2><p class="muted small">Six role-plays that follow a cross-border PE/VC transaction end to end. Formal register, real finance vocabulary, a counterparty who negotiates back. Vocabulary lives under <a href="#/business" style="text-decoration:underline">Deal Desk</a>.</p></div>
      <div class="grid grid-3">${SCENARIOS.filter(s => s.track === 'business').map(s => `<a class="tile" href="#/talk/${s.id}" style="border-color:var(--sky-500)"><span class="hz" style="font-size:1.6rem">${esc(s.title)}</span><b>${esc(s.en)}</b><span class="small muted">${esc(s.goal)}</span><span class="faint small">from HSK ${s.minLevel}</span></a>`).join('')}</div>
      ${state.talks.length ? `<section class="card stack"><h2 class="h3">Past sessions</h2>${state.talks.slice(-8).reverse().map(t => `<div class="row between small"><span><b>${esc(t.scenario)}</b> · ${esc(t.date)} · ${t.turns} turns</span><span class="muted">${esc(t.summary || '')}</span></div>`).join('')}</section>` : ''}
    </div>`;
  };
  routes.talk.after = async arg => {
    if (arg) { renderSession(); return; }
    const el = document.getElementById('talk-status'); if (!el) return;
    const p = await providerName();
    el.innerHTML = p === 'artifact' ? '✅ AI tutor ready (using your Claude account through this preview).'
      : p === 'sdk' ? `✅ AI tutor ready (your API key, model ${MODEL}). Usage is billed to your key.`
      : `⚠️ The tutor needs an Anthropic API key on this site. Add one under <a href="#/settings" style="text-decoration:underline">Settings → AI tutor</a>. Keys never leave your browser.`;
  };

  function startSession(sc) {
    if (T.sc && T.sc.id === sc.id && T.turns.length) return;      // resume
    const chars = learnedCharacters();
    T.sc = sc; T.level = currentLevel(chars); T.known = chars.join(''); T.turns = []; T.busy = false; T.startedAt = Date.now(); T.handsFree = false;
    if (window.SenLinCloud) window.SenLinCloud.track('talk_start', { scenario: sc.id, level: T.level });
    T.turns.push({ role: 'assistant', content: `ZH: ${sc.opener.zh}\nPY: ${sc.opener.p}\nEN: ${sc.opener.en}\nFIX: ✓\nNEW: -`, parsed: { zh: sc.opener.zh, py: sc.opener.p, en: sc.opener.en, fix: '✓', words: [] } });
  }

  function bubble(t, i) {
    if (t.role === 'user') return `<div class="msg me"><div class="hz">${esc(t.content)}</div></div>`;
    const r = t.parsed || parseReply(t.content);
    return `<div class="msg tutor">
      <div class="row between"><div class="hz zh">${esc(r.zh || '…')}</div><span class="row">${r.zh ? `<button class="btn btn-icon" data-say="${esc(r.zh)}" title="Listen">🔊</button><button class="btn btn-icon" data-say="${esc(r.zh)}" data-rate="0.6" title="Slow">🐢</button>` : ''}</span></div>
      ${r.py ? `<div class="py small">${pinyinHTML(r.py)}</div>` : ''}
      ${r.en ? `<div class="en small muted${T.showEn ? '' : ' hidden'}" data-reveal>${esc(r.en)}</div>` : ''}
      ${r.fix && r.fix !== '✓' ? `<div class="fix small">✏️ ${esc(r.fix)}</div>` : (i > 0 && r.fix === '✓' ? '<div class="fix ok small">✓ nice</div>' : '')}
      ${r.words.length ? `<div class="row">${r.words.map(w => `<button class="chip chip-gold" data-addword="${esc(JSON.stringify(w))}" title="Add to my review deck"><span class="hz">${esc(w.w)}</span> ${esc(w.p)} · ${esc(w.m)} ＋</button>`).join('')}</div>` : ''}
    </div>`;
  }

  function renderSession() {
    const el = document.getElementById('talk'); if (!el || !T.sc) return;
    const ASR = A.listenEngine();
    el.innerHTML = `<div class="stack">
      <div class="row between"><div><span class="eyebrow">${esc(T.sc.en)} · HSK ${T.level}</span><h1 class="h3"><span class="hz">${esc(T.sc.title)}</span> — ${esc(T.sc.persona)}</h1><p class="small muted">Goal: ${esc(T.sc.goal)}</p></div>
        <div class="row"><button class="btn btn-sm${T.showEn ? ' btn-primary' : ''}" id="toggle-en">EN</button>${ASR ? `<button class="btn btn-sm${T.handsFree ? ' btn-gold' : ''}" id="handsfree" title="Voice loop: the tutor speaks, then listens for your answer">🎧 Hands-free</button>` : ''}<button class="btn btn-sm btn-ghost" id="end">End &amp; review</button></div></div>
      <div class="chat" id="chat">${T.turns.map(bubble).join('')}${T.busy ? '<div class="msg tutor"><div class="muted small">森林老师 is thinking…</div></div>' : ''}</div>
      <form class="composer" id="composer">
        <input class="input" id="say" placeholder="用中文回答… (or type in English and I’ll help)" autocomplete="off" ${T.busy ? 'disabled' : ''}>
        ${ASR ? `<button type="button" class="btn btn-icon" id="mic" title="Speak" ${T.busy ? 'disabled' : ''}>🎤</button>` : ''}
        <button class="btn btn-primary" type="submit" ${T.busy ? 'disabled' : ''}>Send</button>
      </form>
      <div class="small muted" id="talk-note">${ASR ? '' : '🎤 Microphone input needs Chrome (desktop or Android), the app, or a signed-in account for the cloud recogniser. Here you can type your replies; the tutor still speaks.'}</div>
    </div>`;
    const chat = document.getElementById('chat'); chat.scrollTop = chat.scrollHeight;
    document.getElementById('composer').onsubmit = e => { e.preventDefault(); const v = document.getElementById('say').value.trim(); if (v) send(v); };
    document.getElementById('toggle-en').onclick = () => { T.showEn = !T.showEn; renderSession(); };
    document.getElementById('end').onclick = endSession;
    const hf = document.getElementById('handsfree'); if (hf) hf.onclick = () => { T.handsFree = !T.handsFree; renderSession(); if (T.handsFree) listen(); };
    const mic = document.getElementById('mic'); if (mic) mic.onclick = () => listen();
    el.querySelectorAll('[data-addword]').forEach(b => b.onclick = () => { const w = JSON.parse(b.dataset.addword); addWord(w); b.textContent = '✓ added'; });
    el.querySelectorAll('[data-reveal]').forEach(e => e.onclick = () => e.classList.remove('hidden'));
    if (!T.busy) { const inp = document.getElementById('say'); if (inp && !T.handsFree) inp.focus(); }
  }

  A.addWord = w => addWord(w);
  function addWord(w) {
    state.extra = state.extra || { words: [] };
    if (!state.extra.words.find(x => x.w === w.w)) { state.extra.words.push(w); const s = S.srsInit(); s.due = Date.now() + 86400000; state.srs['x:' + w.w] = s; save(); toast(`${w.w} added to your review deck`); }
  }

  async function send(text) {
    if (T.busy) return;
    T.turns.push({ role: 'user', content: text });
    T.busy = true; renderSession();
    const ctl = new AbortController(); T.ctl = ctl;
    const msgs = T.turns.slice(-16).map(t => ({ role: t.role, content: t.content }));
    if (msgs[0].role === 'assistant') msgs.unshift({ role: 'user', content: '（开始）' });
    const pending = { role: 'assistant', content: '', parsed: null };
    T.turns.push(pending); T.busy = false;
    let live = null;
    try {
      const sys = systemPrompt(T.sc, T.level, T.known);
      const text = await complete(sys, msgs, whole => {
        pending.content = whole; pending.parsed = parseReply(whole);
        if (!live) { renderSession(); live = document.querySelector('#chat .msg.tutor:last-child'); }
        else live.querySelector('.zh').textContent = pending.parsed.zh || '…';
      }, ctl.signal);
      pending.content = text; pending.parsed = parseReply(text);
      renderSession();
      if (pending.parsed.zh) { tts.speak(pending.parsed.zh); if (T.handsFree) waitThenListen(pending.parsed.zh); }
    } catch (e) {
      T.turns.pop();
      const code = e && e.code; const note = document.getElementById('talk-note');
      const msg = code === 'no_key' ? 'Add your Anthropic API key in Settings → AI tutor to talk on this site.'
        : code === 'not_granted' ? 'You declined AI access for this page; reload to be asked again.'
        : code === 'rate_limited' ? 'Rate limited — wait a moment and try again.'
        : code === 'refused' ? 'The tutor declined that message. Try phrasing it differently.'
        : (e && (e.message || String(e)));
      renderSession(); const n = document.getElementById('talk-note'); if (n) n.textContent = '⚠️ ' + msg;
      if (note) note.textContent = '⚠️ ' + msg;
    } finally { T.busy = false; }
  }

  function waitThenListen(zh) {
    /* start listening once the tutor's voice finishes */
    const check = () => { if (!T.handsFree) return; if (tts.speaking) setTimeout(check, 200); else listen(); };
    setTimeout(check, 400);
  }

  function listen() {
    if (!A.listenEngine()) return;
    if (T.stopListen) { T.stopListen(); T.stopListen = null; return; }
    tts.stop();
    const inp = document.getElementById('say'); const mic = document.getElementById('mic'); const note = document.getElementById('talk-note');
    if (mic) mic.classList.add('btn-primary'); if (note) note.textContent = A.listenEngine() === 'cloud' ? '🎤 recording… speak Chinese, tap the mic again to stop' : '🎤 listening… speak Chinese';
    T.stopListen = A.listenOnce({
      seconds: 8,
      onResult: alts => { const t = (alts[0] || '').trim(); if (inp) inp.value = t; if (T.handsFree && t) send(t); },
      onError: msg => { if (note) note.textContent = msg; },
      onEnd: () => { T.stopListen = null; if (mic) mic.classList.remove('btn-primary'); if (note && note.textContent.startsWith('🎤')) note.textContent = ''; if (T.handsFree && !T.busy && inp && !inp.value.trim()) setTimeout(() => { if (T.handsFree && !T.busy) listen(); }, 600); }
    });
  }

  async function endSession() {
    if (!T.sc) return;
    if (T.ctl) T.ctl.abort();
    T.handsFree = false; if (window.speechSynthesis) speechSynthesis.cancel();
    const userTurns = T.turns.filter(t => t.role === 'user');
    if (window.SenLinCloud) window.SenLinCloud.track('talk_end', { turns: userTurns.length, seconds: Math.round((Date.now() - T.startedAt) / 1000) });
    const el = document.getElementById('talk');
    if (!userTurns.length) { T.sc = null; T.turns = []; location.hash = '#/talk'; return; }
    el.innerHTML = `<div class="card stack"><h2 class="h3">Reviewing your session…</h2><p class="muted small">森林老师 is writing your feedback.</p></div>`;
    const transcript = T.turns.map(t => (t.role === 'user' ? 'LEARNER: ' + t.content : 'TUTOR: ' + ((t.parsed && t.parsed.zh) || ''))).join('\n');
    const sys = `You are a Mandarin tutor writing end-of-session feedback for a learner at HSK ${T.level}. Be specific, encouraging and brief. Reply in EXACTLY this format:
SCORE: <0-100 overall for accuracy and fluency>
GOOD: <one sentence in English on what went well>
FIX1: <wrong Chinese → corrected Chinese — one-line English reason>
FIX2: <same, or ->
FIX3: <same, or ->
NEXT: <one sentence in English: what to practise next>
WORDS: <up to 5 useful words for this learner: 词|pinyin|meaning separated by ;>`;
    let text = '';
    try { text = await complete(sys, [{ role: 'user', content: 'Session transcript:\n' + transcript }], () => {}, null); } catch (e) { text = ''; }
    const grab = k => { const m = text.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); return m ? m[1].trim() : ''; };
    const score = parseInt(grab('SCORE'), 10);
    const fixes = ['FIX1', 'FIX2', 'FIX3'].map(grab).filter(x => x && x !== '-');
    const words = (grab('WORDS') || '').split(/[;；]/).map(s => s.split('|').map(x => x.trim())).filter(a => a.length >= 2 && /\p{Script=Han}/u.test(a[0])).map(a => ({ w: a[0], p: a[1] || '', m: a[2] || '' }));
    const rec = { scenario: T.sc.en, date: S.isoDate(new Date()), turns: userTurns.length, minutes: Math.round((Date.now() - T.startedAt) / 60000), score: isNaN(score) ? null : score, summary: grab('GOOD') };
    state.talks.push(rec); save();
    el.innerHTML = `<div class="card stack">
      <span class="eyebrow">Session complete · ${esc(T.sc.en)}</span>
      <div class="row" style="gap:1.5rem"><div class="stat"><b>${rec.score === null ? '—' : rec.score}</b><span>score</span></div><div class="stat"><b>${rec.turns}</b><span>your turns</span></div><div class="stat"><b>${rec.minutes}</b><span>minutes</span></div></div>
      ${grab('GOOD') ? `<p><b>What went well:</b> ${esc(grab('GOOD'))}</p>` : '<p class="muted">Feedback unavailable this time.</p>'}
      ${fixes.length ? `<div><b>Corrections</b><ul class="stack small" style="gap:.3rem;list-style:disc;padding-left:1.2rem">${fixes.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
      ${grab('NEXT') ? `<p><b>Next time:</b> ${esc(grab('NEXT'))}</p>` : ''}
      ${words.length ? `<div><b>Words to keep</b><div class="row">${words.map(w => `<button class="chip chip-gold" data-addword="${esc(JSON.stringify(w))}"><span class="hz">${esc(w.w)}</span> ${esc(w.p)} · ${esc(w.m)} ＋</button>`).join('')}</div></div>` : ''}
      <div class="row"><a class="btn btn-primary" href="#/talk">Another scenario</a><a class="btn" href="#/">Back to Today</a></div>
    </div>`;
    el.querySelectorAll('[data-addword]').forEach(b => b.onclick = () => { addWord(JSON.parse(b.dataset.addword)); b.textContent = '✓ added'; });
    T.sc = null; T.turns = [];
  }

  /* ------------------------------------------------------------ settings section */
  A.settingsExtra = () => `<section class="card stack">
      <h2 class="h3">AI tutor</h2>
      <p class="muted small">The Talk page runs live conversations with Claude. ${window.SenLinCloud && window.SenLinCloud.available() ? 'Signed-in learners use the SenLin tutor service (no key needed; daily limits apply). ' : ''}Inside the claude.ai preview it uses your Claude account automatically. You can also bring your own Anthropic API key, stored only in this browser and sent only to api.anthropic.com. Model: ${MODEL}; each turn costs a fraction of a cent.</p>
      <div class="field"><label for="apikey">Anthropic API key</label><input class="input" id="apikey" type="password" placeholder="sk-ant-…" value="${esc(state.settings.apiKey || '')}" autocomplete="off"></div>
      <div class="row"><button class="btn" id="testkey">Test connection</button><span class="small muted" id="keystatus"></span></div>
    </section>`;
  A.settingsExtraAfter = () => {
    const i = document.getElementById('apikey'); if (!i) return;
    i.onchange = () => { state.settings.apiKey = i.value.trim(); save(); toast(state.settings.apiKey ? 'API key saved in this browser' : 'API key removed'); };
    document.getElementById('testkey').onclick = async () => {
      const st = document.getElementById('keystatus'); st.textContent = 'testing…';
      try { const t = await complete('Reply with exactly: 你好，森林！', [{ role: 'user', content: 'ping' }], () => {}, null); st.textContent = '✅ ' + t.trim().slice(0, 40); }
      catch (e) { st.textContent = '❌ ' + (e && e.code === 'no_key' ? 'no key (and not inside the claude.ai preview)' : (e && (e.message || e.code)) || 'failed'); }
    };
  };

  /* extra (tutor-added) words join the review pool */
  A.extraReviewItems = () => ((state.extra && state.extra.words) || []).map(w => ({ id: 'x:' + w.w, type: 'w', ref: w, day: 0 }));

  if (/^#\/talk/.test(location.hash)) A.navigate();
})();
