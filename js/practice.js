/* Mandarin The SenLin Way — practice add-ons
   - Write it: stroke-order animation and drawing quiz (Hanzi Writer, loaded from jsdelivr on demand)
   - Tone gym: listen and name the tone / tone pair
   - Placement: "I already know HSK N" marks earlier levels as learned                       */
(function () {
  'use strict';
  const A = window.SenLinApp; if (!A) return;
  const { routes, state, save, esc, tts, toast, pinyinHTML } = A;
  const S = window.SenLin;
  const $ = s => document.querySelector(s);

  /* ------------------------------------------------------------ Hanzi Writer */
  const HW_URL = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.7.3/dist/hanzi-writer.min.js';
  let hwPromise = null;
  function loadHanziWriter() {
    if (window.HanziWriter) return Promise.resolve(window.HanziWriter);
    return hwPromise || (hwPromise = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = HW_URL; s.onload = () => res(window.HanziWriter); s.onerror = () => { hwPromise = null; rej(new Error('Could not load the stroke-order library (offline?)')); };
      document.head.appendChild(s);
    }));
  }
  state.progress.writes = state.progress.writes || { total: 0, chars: {} };

  async function openWriter(ch) {
    const info = S.CHARACTERS.find(c => c.h === ch) || { h: ch, p: '', m: '' };
    const dlg = $('#dialog'); const inner = $('#dialog-inner');
    inner.innerHTML = `<div class="row between"><span class="eyebrow">Write it · stroke order</span><button class="btn btn-sm btn-ghost" data-close>✕</button></div>
      <div class="row" style="gap:1rem;align-items:flex-start;justify-content:center;flex-wrap:wrap">
        <div id="hw-box" class="hw-box"><div class="muted small" style="padding:6rem 0;text-align:center">loading…</div></div>
        <div class="stack" style="min-width:180px">
          <div><span class="hz" style="font-size:2.2rem">${esc(info.h)}</span> <span class="py">${pinyinHTML(info.p)}</span><div class="muted small">${esc(info.m)}</div></div>
          <button class="btn btn-primary" id="hw-animate">▶ Animate strokes</button>
          <button class="btn" id="hw-quiz">✍️ Draw it yourself</button>
          <label class="small muted"><input type="checkbox" id="hw-outline" checked> show outline while drawing</label>
          <div class="small muted" id="hw-status">Watch once, then draw each stroke in order. Wrong strokes shake; three misses show the stroke.</div>
          <div class="faint small">Written ${(state.progress.writes.chars[ch] || 0)}× before</div>
        </div></div>`;
    if (!dlg.open) dlg.showModal();
    try {
      const HW = await loadHanziWriter();
      const box = $('#hw-box'); box.innerHTML = '';
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#23623e';
      const writer = HW.create(box, ch, { width: 260, height: 260, padding: 10, showOutline: true, showCharacter: true, strokeColor: accent, radicalColor: '#c9973a', outlineColor: 'rgba(128,128,128,.25)', drawingColor: accent, drawingWidth: 18, strokeAnimationSpeed: 1, delayBetweenStrokes: 250, showHintAfterMisses: 3, highlightOnComplete: true });
      $('#hw-animate').onclick = () => { writer.showCharacter(); writer.animateCharacter(); };
      $('#hw-quiz').onclick = () => {
        const outline = $('#hw-outline').checked; $('#hw-status').textContent = 'Draw stroke 1…';
        if (outline) writer.showOutline(); else writer.hideOutline();
        writer.quiz({
          onCorrectStroke: d => { $('#hw-status').textContent = `Stroke ${d.strokeNum + 1} of ${d.strokesRemaining + d.strokeNum + 1} ✓`; },
          onMistake: d => { $('#hw-status').textContent = `Not quite — ${d.mistakesOnStroke} miss${d.mistakesOnStroke > 1 ? 'es' : ''} on stroke ${d.strokeNum + 1}`; },
          onComplete: d => { state.progress.writes.total++; state.progress.writes.chars[ch] = (state.progress.writes.chars[ch] || 0) + 1; save(); $('#hw-status').textContent = `Done — ${d.totalMistakes} mistake${d.totalMistakes === 1 ? '' : 's'}. ${d.totalMistakes === 0 ? '完美！' : 'Again?'}`; }
        });
      };
      writer.animateCharacter();
    } catch (e) { $('#hw-box').innerHTML = `<p class="small muted" style="padding:2rem">${esc(e.message)}</p>`; }
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-write]'); if (b) openWriter(b.dataset.write); });
  A.openWriter = openWriter;

  /* ------------------------------------------------------------ Tone gym */
  const TONE_NAMES = { 1: '1st · high flat ˉ', 2: '2nd · rising ˊ', 3: '3rd · low dip ˇ', 4: '4th · falling ˋ', 5: 'neutral · light' };
  const gym = { mode: 'single', item: null, answered: false, right: 0, total: 0, streak: 0 };
  state.progress.tones = state.progress.tones || { total: 0, right: 0, best: 0 };
  function pool() {
    const days = A.DAYS(); const today = A.todayDay(); const done = state.progress.completed;
    let items = S.learnedItems(days, Math.min(today, days.length)).filter(i => done[i.day]);
    if (items.filter(i => i.type === 'c').length < 20) items = S.CHARACTERS.filter(c => c.level === 1).map(c => ({ type: 'c', ref: c }));
    return items;
  }
  function nextItem() {
    const items = pool();
    if (gym.mode === 'single') {
      const cs = items.filter(i => i.type === 'c'); const c = cs[Math.floor(Math.random() * cs.length)].ref;
      gym.item = { text: c.h, p: c.p, m: c.m, answer: String(S.parsePinyin(c.p).tone), options: ['1', '2', '3', '4', '5'] };
    } else {
      const ws = items.filter(i => i.type === 'w' && Array.from(i.ref.w).length === 2); const w = ws[Math.floor(Math.random() * ws.length)].ref;
      const syl = w.p.replace(/['’]/g, ' ').split(/\s+/).join(' ');
      const tones = tonesOf(w);
      const answer = tones.join('-');
      const opts = new Set([answer]); let guard = 0;
      while (opts.size < 4 && guard++ < 50) opts.add(`${1 + Math.floor(Math.random() * 4)}-${1 + Math.floor(Math.random() * 4)}`);
      gym.item = { text: w.w, p: w.p, m: w.m, answer, options: Array.from(opts).sort(() => Math.random() - .5), syl };
    }
    gym.answered = false;
  }
  /** tones of a two-character word from its characters' pinyin (falls back to the word's pinyin marks) */
  function tonesOf(w) {
    return Array.from(w.w).map(h => { const c = S.CHARACTERS.find(x => x.h === h); return c ? S.parsePinyin(c.p).tone : 5; }).map(t => t === 5 ? 5 : t);
  }
  routes.tones = function () {
    if (!gym.item) nextItem();
    const it = gym.item;
    return `<div class="stack-lg" style="max-width:640px">
      <div class="row between"><div><span class="eyebrow">Tone gym</span><h1 class="h2">Hear it, name the tone</h1></div>
        <div class="row"><button class="btn btn-sm${gym.mode === 'single' ? ' btn-primary' : ''}" data-mode="single">Single</button><button class="btn btn-sm${gym.mode === 'pair' ? ' btn-primary' : ''}" data-mode="pair">Tone pairs</button></div></div>
      <div class="card stack" style="text-align:center">
        <div class="row" style="justify-content:center"><button class="btn btn-lg btn-primary" data-say="${esc(it.text)}">🔊 Play</button><button class="btn" data-say="${esc(it.text)}" data-rate="0.6">🐢 Slow</button></div>
        <div class="big-hz" style="font-size:4rem;${gym.answered ? '' : 'filter:blur(14px);opacity:.5'}">${esc(it.text)}</div>
        <div class="muted small">${gym.answered ? `<span class="py">${pinyinHTML(it.p)}</span> · ${esc(it.m)}` : 'Listen, then choose. The character is revealed after you answer.'}</div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
          ${it.options.map(o => `<button class="quiz-opt${gym.answered ? (o === it.answer ? ' right' : '') : ''}" data-tone="${o}" style="text-align:center">${gym.mode === 'single' ? esc(TONE_NAMES[o]) : esc(o)}</button>`).join('')}
        </div>
        ${gym.answered ? `<div class="row" style="justify-content:center"><button class="btn btn-primary" id="tone-next">Next →</button></div>` : ''}
      </div>
      <div class="row between small muted"><span>Session: ${gym.right} / ${gym.total} · streak ${gym.streak}</span><span>All time: ${state.progress.tones.total ? Math.round(state.progress.tones.right / state.progress.tones.total * 100) : 0}% of ${state.progress.tones.total} · best streak ${state.progress.tones.best}</span></div>
      <p class="small muted">Why this matters: tone errors are the number-one reason learners are misunderstood. Ten reps a day here rewires the ear faster than any amount of reading.</p>
    </div>`;
  };
  routes.tones.after = () => {
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { gym.mode = b.dataset.mode; gym.item = null; A.navigate(); });
    document.querySelectorAll('[data-tone]').forEach(b => b.onclick = () => {
      if (gym.answered) return; gym.answered = true; gym.total++; state.progress.tones.total++;
      const ok = b.dataset.tone === gym.item.answer;
      if (ok) { gym.right++; gym.streak++; state.progress.tones.right++; state.progress.tones.best = Math.max(state.progress.tones.best, gym.streak); } else { gym.streak = 0; b.classList.add('wrong'); }
      save(); const saved = b; A.navigate(); if (!ok) { const w = document.querySelector(`[data-tone="${saved.dataset.tone}"]`); if (w) w.classList.add('wrong'); }
    });
    const n = $('#tone-next'); if (n) n.onclick = () => { nextItem(); A.navigate(); tts.speak(gym.item.text); };
    document.addEventListener('keydown', toneKeys);
  };
  function toneKeys(e) { if (!location.hash.startsWith('#/tones')) { document.removeEventListener('keydown', toneKeys); return; } if (e.target.matches('input,textarea')) return; if (e.key === ' ') { e.preventDefault(); tts.speak(gym.item.text); } const b = document.querySelector(`[data-tone="${e.key}"]`); if (b && gym.mode === 'single') b.click(); if (e.key === 'Enter') { const n = $('#tone-next'); if (n) n.click(); } }

  /* ------------------------------------------------------------ Placement */
  A.applyPlacement = function (level) {
    const days = A.DAYS(); const now = Date.now(); let n = 0;
    for (const d of days) {
      const isPron = d.type === 'pron'; const lvl = d.level || 0;
      if (!(isPron || (lvl && lvl <= level))) continue;
      if (!state.progress.completed[d.day]) { state.progress.completed[d.day] = 'skipped'; n++; }
      S.learnedItems([d], d.day).forEach(i => { if (!state.srs[i.id]) { const s = S.srsInit(); s.reps = 3; s.ivl = 30; s.ef = 2.5; s.due = now + (7 + Math.floor(Math.random() * 30)) * 86400000; state.srs[i.id] = s; } });
    }
    state.settings.placement = level; save();
    return n;
  };
  A.placementExtra = () => `<section class="card stack">
      <h2 class="h3">Already know some Chinese?</h2>
      <p class="muted small">Mark everything up to a level as learned. Those days leave the catch-up queue and their characters, words and sentences enter your review deck on a gentle 1–5 week schedule, so gaps still surface.</p>
      <div class="row"><select class="input" id="placement" style="max-width:260px">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}"${(state.settings.placement || 0) === n ? ' selected' : ''}>${n === 0 ? 'Start from zero' : `I know HSK ${n} (skip to HSK ${n + 1})`}</option>`).join('')}</select><button class="btn" id="placement-apply">Apply</button></div>
    </section>`;
  A.placementExtraAfter = () => {
    const b = $('#placement-apply'); if (!b) return;
    b.onclick = () => { const lvl = +$('#placement').value; if (!lvl) { state.settings.placement = 0; save(); toast('Placement cleared (progress kept)'); return; } if (!confirm(`Mark HSK 1–${lvl} as already learned?`)) return; const n = A.applyPlacement(lvl); toast(`${n} days marked learned · start at HSK ${lvl + 1}`); };
  };
})();
