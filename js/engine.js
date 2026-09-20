/* Mandarin The SenLin Way — engine
   Pure functions shared by the website and the CLI (tools/lesson.js).
   - pinyin parsing  →  actor / set / room
   - top-down scheduler: characters → words → sentences
   - SM-2 spaced repetition
   - the 10-minute lesson builder                                              */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data/pinyin.js'), require('./data/components.js'), require('./data/levels.js'), require('./data/grammar.js'), require('./data/business.js'), require('./data/levelinfo.js'));
  } else {
    root.SenLin = factory(root.SENLIN_PINYIN, root.SENLIN_COMPONENTS, root.SENLIN_LEVELS || [], root.SENLIN_GRAMMAR || [], root.SENLIN_BUSINESS || null, root.SENLIN_LEVELINFO || null);
  }
})(this, function (PINYIN, BASE_COMPONENTS, RAW_LEVELS, GRAMMAR, BUSINESS, LEVELINFO) {
  'use strict';

  /* ---------- levels → flat, tagged lists (teaching order = level order, then file order) */
  const LEVELS = RAW_LEVELS.slice().sort((a, b) => a.level - b.level).filter(l => l.characters.length);
  const tag = (l, arr) => arr.map(x => Object.assign({ level: l.level }, x));
  const COMPONENTS = BASE_COMPONENTS.concat(LEVELS.flatMap(l => l.components || []));
  const CHARACTERS = LEVELS.flatMap(l => tag(l, l.characters));
  const WORDS = LEVELS.flatMap(l => tag(l, l.words));
  const SENTENCES = LEVELS.flatMap(l => tag(l, l.sentences));

  const CONFIG = {
    name: 'Mandarin The SenLin Way',
    startDate: '2026-09-21',      // Day 1 (a Monday). Change in Settings.
    charsPerDay: 3,
    wordsPerDay: 4,
    sentencesPerDay: 3,
    lessonMinutes: 10,
    reviewCap: 12,
    businessStartDay: 13,         // the Deal Desk joins the lesson once characters begin (Settings can turn it off)
    /* 10 minutes, in seconds */
    segments: [
      { id: 'warmup',    title: 'Warm-up: tones',        seconds: 60 },
      { id: 'review',    title: 'Review: spaced recall', seconds: 150 },
      { id: 'new',       title: 'New: movie scenes',     seconds: 210 },
      { id: 'sentences', title: 'Sentences: shadowing',  seconds: 120 },
      { id: 'quiz',      title: 'Quiz',                  seconds: 60 }
    ]
  };

  /* ------------------------------------------------------------------ pinyin */
  const TONE_MARKS = {
    'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
    'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
    'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
    'ǖ': ['ü', 1], 'ǘ': ['ü', 2], 'ǚ': ['ü', 3], 'ǜ': ['ü', 4]
  };
  const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];

  /** Split one pinyin syllable into { base, tone, initial, final, actorKey } */
  function parsePinyin(syllable) {
    let tone = 5, base = '';
    for (const ch of syllable.toLowerCase().normalize('NFC')) {
      const t = TONE_MARKS[ch];
      if (t) { base += t[0]; tone = t[1]; } else if (/[a-zü]/.test(ch)) base += ch;
    }
    base = base.replace(/v/g, 'ü');
    let initial = '';
    for (const i of INITIALS) if (base.startsWith(i)) { initial = i; break; }
    let final = base.slice(initial.length);
    if ('jqxy'.includes(initial) && final.startsWith('u')) final = 'ü' + final.slice(1);
    let actorKey = initial;
    if (!initial) actorKey = '∅' + (final[0] === 'e' ? 'e' : final[0] === 'o' ? 'o' : 'a');
    return { base, tone, initial, final, actorKey };
  }

  /* ------------------------------------------------------------------ cast */
  const byKey = (arr, k) => Object.fromEntries(arr.map(o => [o[k], o]));
  const INITIAL_MAP = byKey(PINYIN.initials, 'key');
  const FINAL_MAP = byKey(PINYIN.finals, 'key');
  const TONE_MAP = byKey(PINYIN.tones, 'n');
  const COMP_MAP = byKey(COMPONENTS, 'c');

  /** cast = { actors:{b:'…'}, sets:{a:'…'}, rooms:{1:'…'}, props:{口:'…'} } — user overrides */
  function resolveCast(cast) {
    cast = cast || {};
    return {
      actor: k => (cast.actors && cast.actors[k]) || (INITIAL_MAP[k] && INITIAL_MAP[k].actor) || k,
      set: k => (cast.sets && cast.sets[k]) || (FINAL_MAP[k] && FINAL_MAP[k].set) || k,
      room: n => (cast.rooms && cast.rooms[n]) || (TONE_MAP[n] && TONE_MAP[n].room) || '',
      prop: c => (cast.props && cast.props[c]) || (COMP_MAP[c] && COMP_MAP[c].prop) || c
    };
  }

  /** Build the full movie scene for a character. */
  function scene(ch, cast) {
    const c = resolveCast(cast);
    const py = parsePinyin(ch.p);
    const actor = c.actor(py.actorKey), set = c.set(py.final), room = c.room(py.tone);
    const props = ch.c.map(k => ({ c: k, keyword: (COMP_MAP[k] || {}).k || '', prop: c.prop(k) }));
    const where = /^the /.test(room) ? `in ${room}` : room;
    const text = `${actor}, ${where} of ${set}, ${ch.s}`;
    return { actor, set, room, tone: py.tone, initial: py.initial, final: py.final, actorKey: py.actorKey, props, text };
  }

  /* ------------------------------------------------------------------ schedule */
  const PRON_DAYS = PINYIN.pronunciationDays.length;

  /**
   * Build the whole curriculum as an array of days (index 0 = Day 1).
   * Top-down: a word/sentence is scheduled on the first day when every one of
   * its characters has been learned, capped per day; overflow rolls forward.
   */
  function buildSchedule(opts) {
    const o = Object.assign({}, CONFIG, opts || {});
    const days = [];
    PINYIN.pronunciationDays.forEach((pd, i) => {
      days.push({ day: i + 1, phase: 'Pronunciation Mastery', type: 'pron', pron: pd, chars: [], words: [], sentences: [], grammar: [] });
    });
    const charDay = {};
    const levelEnd = {};                             // level → last day that introduces its characters
    for (const L of LEVELS) {
      const chars = CHARACTERS.filter(c => c.level === L.level);
      for (let i = 0; i < chars.length; i += o.charsPerDay) {
        const chunk = chars.slice(i, i + o.charsPerDay);
        const day = days.length + 1;
        chunk.forEach(ch => { charDay[ch.h] = day; });
        days.push({ day, level: L.level, phase: `Phase ${L.level} · ${L.name}`, type: 'chars', chars: chunk, words: [], sentences: [], grammar: [] });
        levelEnd[L.level] = day;
      }
    }
    const ensureDay = d => { while (days.length < d) days.push({ day: days.length + 1, phase: 'Consolidation', type: 'review', chars: [], words: [], sentences: [], grammar: [] }); return days[d - 1]; };
    const place = (items, textOf, key, cap) => {
      const counts = {};
      items.forEach(item => {
        const chars = Array.from(textOf(item)).filter(c => /\p{Script=Han}/u.test(c));
        let d = Math.max(...chars.map(c => charDay[c] || Infinity));
        if (!isFinite(d)) return;                    // uses a character we never teach: skip
        while ((counts[d] || 0) >= cap) d++;
        counts[d] = (counts[d] || 0) + 1;
        ensureDay(d)[key].push(item);
      });
    };
    place(WORDS, w => w.w, 'words', o.wordsPerDay);
    place(SENTENCES, s => s.zh, 'sentences', o.sentencesPerDay);
    place(GRAMMAR, g => g.zh, 'grammar', 1);
    days.levelEnd = levelEnd;
    return days;
  }

  /* ------------------------------------------------------------------ dates */
  const DAY_MS = 86400000;
  const toUTC = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
  /** Calendar day number for a date (local), 1 = startDate. */
  function dayNumber(date, startISO) {
    const n = Math.floor((toUTC(date) - toUTC(parseISO(startISO))) / DAY_MS) + 1;
    return Math.max(1, n);
  }
  function dateForDay(day, startISO) { const s = parseISO(startISO); s.setDate(s.getDate() + day - 1); return s; }
  const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /* ------------------------------------------------------------------ SRS (SM-2) */
  const GRADE = { again: 0, hard: 1, good: 2, easy: 3 };
  function srsInit() { return { ef: 2.5, ivl: 0, reps: 0, due: 0, lapses: 0 }; }
  /** Apply a grade; returns the new state. `now` in ms. */
  function srsReview(state, grade, now) {
    const s = Object.assign(srsInit(), state);
    if (grade === GRADE.again) { s.reps = 0; s.ivl = 0; s.lapses++; s.ef = Math.max(1.3, s.ef - 0.2); s.due = now + 10 * 60000; return s; }
    const q = grade === GRADE.hard ? 3 : grade === GRADE.good ? 4 : 5;
    s.ef = Math.max(1.3, s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    if (s.reps === 0) s.ivl = grade === GRADE.easy ? 3 : 1;
    else if (s.reps === 1) s.ivl = grade === GRADE.easy ? 7 : grade === GRADE.hard ? 2 : 4;
    else s.ivl = Math.round(s.ivl * (grade === GRADE.hard ? 1.2 : s.ef) * (grade === GRADE.easy ? 1.3 : 1));
    s.reps++; s.due = now + s.ivl * DAY_MS; return s;
  }

  /* ------------------------------------------------------------------ items */
  const itemId = (type, x) => type === 'c' ? 'c:' + x.h : type === 'w' ? 'w:' + x.w : 's:' + x.zh;
  function learnedItems(days, uptoDay) {
    const items = [];
    for (const d of days) {
      if (d.day > uptoDay) break;
      d.chars.forEach(x => items.push({ id: itemId('c', x), type: 'c', ref: x, day: d.day }));
      d.words.forEach(x => items.push({ id: itemId('w', x), type: 'w', ref: x, day: d.day }));
      d.sentences.forEach(x => items.push({ id: itemId('s', x), type: 's', ref: x, day: d.day }));
    }
    return items;
  }

  /* ------------------------------------------------------------------ lesson */
  /** Deterministic pseudo-random for a day, so today's lesson is identical everywhere. */
  function rng(seed) { let x = seed * 2654435761 % 4294967296 || 1; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
  function pick(arr, n, rand) { const a = arr.slice(); const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out; }

  /**
   * Build the 10-minute lesson for a day.
   * srs = { [itemId]: state } (may be empty), now = ms.
   */
  function buildLesson(day, days, srs, cast, now) {
    srs = srs || {}; now = now || Date.now();
    const d = days[day - 1] || days[days.length - 1];
    const rand = rng(day);
    const learnedBefore = learnedItems(days, day - 1);
    const learnedNow = learnedItems(days, day);
    const pairIdx = (day - 1) % PINYIN.tonePairs.length;

    /* warm-up */
    const warmup = d.type === 'pron'
      ? { kind: 'pron', tonePair: PINYIN.tonePairs[pairIdx], drills: d.pron.drills }
      : { kind: 'tones', tonePair: PINYIN.tonePairs[pairIdx], drills: pick(learnedBefore.filter(i => i.type === 'c'), 4, rand).map(i => i.ref) };

    /* review: due first, then the newest unreviewed, then random old */
    const due = learnedBefore.filter(i => srs[i.id] && srs[i.id].due <= now).sort((a, b) => srs[a.id].due - srs[b.id].due);
    const fresh = learnedBefore.filter(i => !srs[i.id]).reverse();
    let review = due.slice(0, CONFIG.reviewCap);
    if (review.length < CONFIG.reviewCap) review = review.concat(fresh.slice(0, CONFIG.reviewCap - review.length));
    if (review.length < CONFIG.reviewCap) {
      const rest = learnedBefore.filter(i => !review.includes(i));
      review = review.concat(pick(rest, CONFIG.reviewCap - review.length, rand));
    }

    /* new */
    const chars = d.chars.map(ch => ({ ch, scene: scene(ch, cast) }));

    /* sentences: today's + a couple of older ones for shadowing */
    const older = pick(learnedBefore.filter(i => i.type === 's'), 2, rand).map(i => i.ref);
    const sentences = d.sentences.concat(older);

    /* quiz: 5 questions from today's new + review */
    const pool = learnedNow.filter(i => i.type !== 's');
    const targets = chars.map(x => ({ id: itemId('c', x.ch), type: 'c', ref: x.ch }))
      .concat(d.words.map(w => ({ id: itemId('w', w), type: 'w', ref: w })))
      .concat(review.filter(i => i.type !== 's'));
    const quiz = pick(targets, 5, rand).map((t, i) => {
      const isChar = t.type === 'c';
      const prompt = isChar ? t.ref.h : t.ref.w;
      const answer = isChar ? t.ref.m : t.ref.m;
      if (i === 2) {                                 // listening question: hear it (or read the pinyin), pick the character/word
        const same = Array.from(new Set(pool.filter(x => x.id !== t.id && x.type === t.type).map(x => isChar ? x.ref.h : x.ref.w)));
        let others = pick(same, 3, rand);
        if (others.length < 3) { const all = Array.from(new Set((isChar ? CHARACTERS : WORDS).map(x => isChar ? x.h : x.w))).filter(x => x !== prompt && !others.includes(x)); others = others.concat(pick(all, 3 - others.length, rand)); }
        return { kind: 'listen', prompt, pinyin: t.ref.p, meaning: t.ref.m, question: 'Listen — which one did you hear?', options: pick([prompt].concat(others), 4, rand), correct: prompt };
      }
      const askPinyin = i % 2 === 1;
      const correct = askPinyin ? t.ref.p : answer;
      const val = x => askPinyin ? x.p : x.m;
      const used = new Set([correct]);
      const take = (cands, n) => { const out = []; for (const x of pick(cands, cands.length, rand)) { const v = val(x); if (!used.has(v)) { used.add(v); out.push(v); if (out.length === n) break; } } return out; };
      let others = take(pool.filter(x => x.id !== t.id && x.type === t.type).map(x => x.ref), 3);
      if (others.length < 3) others = others.concat(take((isChar ? CHARACTERS : WORDS).filter(x => itemId(t.type, x) !== t.id), 3 - others.length));
      const options = pick([correct].concat(others), 4, rand);
      return { prompt, question: askPinyin ? 'How is it pronounced?' : 'What does it mean?', options, correct };
    });

    return { day: d.day, phase: d.phase, type: d.type, pron: d.pron, date: null, warmup, review, chars, words: d.words, grammar: d.grammar || [], sentences, quiz, segments: CONFIG.segments, business: dealDesk(day, CONFIG.businessStartDay) };
  }

  /* ------------------------------------------------------------------ business track ("deal desk") */
  const BIZ_TERMS = BUSINESS ? BUSINESS.units.flatMap(u => u.terms.map(t => Object.assign({ unit: u.id, unitTitle: u.en }, t))) : [];
  const BIZ_PHRASES = BUSINESS ? BUSINESS.units.flatMap(u => u.phrases.map(t => Object.assign({ unit: u.id, unitTitle: u.en }, t))) : [];
  /** Two terms and one phrase per day, walking the units in order; `startDay` = first day the track is on. */
  function dealDesk(day, startDay) {
    if (!BIZ_TERMS.length || day < (startDay || 1)) return null;
    const i = day - (startDay || 1);
    const terms = [BIZ_TERMS[(2 * i) % BIZ_TERMS.length], BIZ_TERMS[(2 * i + 1) % BIZ_TERMS.length]];
    const phrase = BIZ_PHRASES[i % BIZ_PHRASES.length];
    return { terms, phrase, cycle: Math.floor((2 * i) / BIZ_TERMS.length) + 1 };
  }

  /* ------------------------------------------------------------------ text export (CLI / email) */
  function lessonMarkdown(lesson, cast, siteUrl) {
    const L = [];
    const c = resolveCast(cast);
    L.push(`# ${CONFIG.name} — Day ${lesson.day}`);
    L.push(`*${lesson.phase} · 10 minutes*`);
    if (siteUrl) L.push(`\nOpen today’s lesson: ${siteUrl}#/lesson/${lesson.day}`);
    L.push('\n## 1 · Warm-up (1 min)');
    L.push(`Tone pair of the day **${lesson.warmup.tonePair.pair}**: ${lesson.warmup.tonePair.ex} — ${lesson.warmup.tonePair.en}. Say it five times.`);
    if (lesson.warmup.kind === 'tones' && lesson.warmup.drills.length) L.push('Say aloud: ' + lesson.warmup.drills.map(x => `${x.h} ${x.p}`).join(' · '));
    if (lesson.warmup.kind === 'pron') lesson.warmup.drills.forEach(x => L.push('- ' + x));
    L.push('\n## 2 · Review (2½ min)');
    if (!lesson.review.length) L.push('Nothing to review yet — enjoy the warm-up twice.');
    lesson.review.forEach(i => {
      const r = i.ref;
      L.push(i.type === 'c' ? `- ${r.h} — ${r.p} — ${r.m}` : i.type === 'w' ? `- ${r.w} — ${r.p} — ${r.m}` : `- ${r.zh} — ${r.p} — ${r.en}`);
    });
    L.push('\n## 3 · New (3½ min)');
    if (lesson.type === 'pron') {
      const p = lesson.pron;
      L.push(`**${p.title}**\n\n${p.brief}`);
      (p.initials || []).forEach(k => { const i = INITIAL_MAP[k]; L.push(`- Actor **${k}-** (${i.ex}): ${i.hint}. Cast: ${c.actor(k)}`); });
      (p.finalsIntro || []).forEach(k => { const f = FINAL_MAP[k]; L.push(`- Set **-${k}** (${f.ex}): ${f.hint}. Location: ${c.set(k)}`); });
      (p.tones || []).forEach(n => { const t = TONE_MAP[n]; L.push(`- ${t.name}: ${t.contour} — ${t.hint}. Room: ${t.room}`); });
      (p.pairs || []).forEach(pr => { const tp = PINYIN.tonePairs.find(x => x.pair === pr); L.push(`- ${tp.pair}: ${tp.ex} (${tp.en})`); });
      (p.props || []).forEach(k => L.push(`- ${k} = ${COMP_MAP[k].k} → prop: ${c.prop(k)}`));
      L.push(`\n**Task:** ${p.task}`);
    } else if (lesson.chars.length) {
      lesson.chars.forEach(({ ch, scene: sc }) => {
        L.push(`### ${ch.h}  ${ch.p}  — ${ch.m}`);
        L.push(`Props: ${sc.props.map(p => `${p.c} ${p.keyword} (${p.prop})`).join(', ')}`);
        L.push(`Scene: ${sc.text}`);
      });
    } else {
      L.push('No new characters today: consolidate. Re-tell the scenes for three random characters from memory.');
    }
    if (lesson.words.length) { L.push('\n**New words**'); lesson.words.forEach(w => L.push(`- ${w.w} ${w.p} — ${w.m}`)); }
    lesson.grammar.forEach(g => { L.push(`\n**Pattern of the day: ${g.name}** — ${g.pattern}`); L.push(`${g.zh}  ${g.p}  — ${g.en}`); L.push(g.note); });
    if (lesson.business) { L.push('\n**Deal desk (business Mandarin)**'); lesson.business.terms.forEach(t => L.push(`- ${t.w} ${t.p} — ${t.m}${t.note ? ' · ' + t.note : ''}`)); L.push(`- ${lesson.business.phrase.zh}  ${lesson.business.phrase.p}  — ${lesson.business.phrase.en}`); }
    L.push('\n## 4 · Sentences: shadow each one 3× (2 min)');
    lesson.sentences.forEach(s => L.push(`- ${s.zh}  ${s.p}  — ${s.en}`));
    L.push('\n## 5 · Quiz (1 min)');
    lesson.quiz.forEach((q, i) => L.push(q.kind === 'listen' ? `${i + 1}. **${q.pinyin}** — which one is it?  ${q.options.map((o, j) => `(${'abcd'[j]}) ${o}`).join('  ')}` : `${i + 1}. **${q.prompt}** — ${q.question}  ${q.options.map((o, j) => `(${'abcd'[j]}) ${o}`).join('  ')}`));
    L.push('\nAnswers: ' + lesson.quiz.map((q, i) => `${i + 1}${'abcd'[q.options.indexOf(q.correct)]}`).join(' '));
    return L.join('\n');
  }

  /* ------------------------------------------------------------------ stats */
  function curriculumStats(days) {
    const last = days[days.length - 1].day;
    const levels = LEVELS.map(l => ({ level: l.level, name: l.name, characters: l.characters.length, words: l.words.length, sentences: l.sentences.length, lastDay: days.levelEnd ? days.levelEnd[l.level] : null }));
    return { days: last, pronDays: PRON_DAYS, characters: CHARACTERS.length, words: WORDS.length, sentences: SENTENCES.length, grammar: GRAMMAR.length, components: COMPONENTS.length, levels };
  }

  return {
    CONFIG, GRADE, PINYIN, COMPONENTS, CHARACTERS, WORDS, SENTENCES, GRAMMAR, LEVELS, BUSINESS, LEVELINFO, BIZ_TERMS, BIZ_PHRASES, dealDesk,
    INITIAL_MAP, FINAL_MAP, TONE_MAP, COMP_MAP,
    parsePinyin, resolveCast, scene,
    buildSchedule, dayNumber, dateForDay, isoDate, parseISO,
    srsInit, srsReview, itemId, learnedItems,
    buildLesson, lessonMarkdown, curriculumStats
  };
});
