#!/usr/bin/env node
/* Engine tests.  Run: node --test tools/test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/engine.js');

test('parsePinyin splits initial, final and tone', () => {
  assert.deepEqual(pick(S.parsePinyin('wǒ')), { initial: 'w', final: 'o', tone: 3, actorKey: 'w' });
  assert.deepEqual(pick(S.parsePinyin('zhōng')), { initial: 'zh', final: 'ong', tone: 1, actorKey: 'zh' });
  assert.deepEqual(pick(S.parsePinyin('xué')), { initial: 'x', final: 'üe', tone: 2, actorKey: 'x' });
  assert.deepEqual(pick(S.parsePinyin('nǚ')), { initial: 'n', final: 'ü', tone: 3, actorKey: 'n' });
  assert.deepEqual(pick(S.parsePinyin('èr')), { initial: '', final: 'er', tone: 4, actorKey: '∅e' });
  assert.deepEqual(pick(S.parsePinyin('ài')), { initial: '', final: 'ai', tone: 4, actorKey: '∅a' });
  assert.deepEqual(pick(S.parsePinyin('ma')), { initial: 'm', final: 'a', tone: 5, actorKey: 'm' });
  function pick(o) { return { initial: o.initial, final: o.final, tone: o.tone, actorKey: o.actorKey }; }
});

test('schedule is top-down: no word or sentence before all of its characters', () => {
  const days = S.buildSchedule();
  const charDay = {}; days.forEach(d => d.chars.forEach(c => { charDay[c.h] = d.day; }));
  for (const d of days) {
    for (const w of d.words) for (const c of Array.from(w.w).filter(x => /\p{Script=Han}/u.test(x))) assert.ok(charDay[c] <= d.day, `${w.w} on day ${d.day} before ${c} (day ${charDay[c]})`);
    for (const s of d.sentences) for (const c of Array.from(s.zh).filter(x => /\p{Script=Han}/u.test(x))) assert.ok(charDay[c] <= d.day, `"${s.zh}" on day ${d.day} before ${c}`);
    for (const g of d.grammar) for (const c of Array.from(g.zh).filter(x => /\p{Script=Han}/u.test(x))) assert.ok(charDay[c] <= d.day, `pattern ${g.name} before ${c}`);
  }
  assert.equal(days[0].type, 'pron');
  assert.equal(days[S.PINYIN.pronunciationDays.length].chars[0].h, '木');
});

test('per-day caps hold', () => {
  const days = S.buildSchedule();
  for (const d of days) { assert.ok(d.words.length <= S.CONFIG.wordsPerDay); assert.ok(d.sentences.length <= S.CONFIG.sentencesPerDay); assert.ok(d.grammar.length <= 1); assert.ok(d.chars.length <= S.CONFIG.charsPerDay); }
});

test('pace setting changes the number of days', () => {
  const slow = S.buildSchedule({ charsPerDay: 2 }).length, fast = S.buildSchedule({ charsPerDay: 5 }).length;
  assert.ok(slow > fast);
});

test('lessons build for every day, deterministically', () => {
  const days = S.buildSchedule();
  for (let d = 1; d <= days.length; d++) {
    const a = S.buildLesson(d, days, {}, null, 1000), b = S.buildLesson(d, days, {}, null, 1000);
    assert.deepEqual(a.quiz, b.quiz, `day ${d} quiz not deterministic`);
    if (a.type !== 'pron') assert.ok(a.quiz.length >= 3);
    a.quiz.forEach(q => { assert.ok(q.options.includes(q.correct), `day ${d}: correct answer missing from options`); assert.equal(new Set(q.options).size, q.options.length, `day ${d}: duplicate options`); });
  }
});

test('review prefers due cards, then never-reviewed, capped', () => {
  const days = S.buildSchedule();
  const items = S.learnedItems(days, 20);
  const now = 10_000_000_000;
  const srs = {}; srs[items[0].id] = Object.assign(S.srsInit(), { due: now - 1 }); srs[items[1].id] = Object.assign(S.srsInit(), { due: now + 1 });
  const L = S.buildLesson(21, days, srs, null, now);
  assert.equal(L.review[0].id, items[0].id);
  assert.ok(!L.review.some(i => i.id === items[1].id) || L.review.length > items.length - 1);
  assert.ok(L.review.length <= S.CONFIG.reviewCap);
});

test('SM-2: intervals grow with good answers and reset on again', () => {
  const now = 0; let s = S.srsInit();
  s = S.srsReview(s, S.GRADE.good, now); assert.equal(s.ivl, 1);
  s = S.srsReview(s, S.GRADE.good, now); assert.equal(s.ivl, 4);
  s = S.srsReview(s, S.GRADE.good, now); assert.ok(s.ivl > 4);
  const before = s.ivl; s = S.srsReview(s, S.GRADE.again, now); assert.equal(s.ivl, 0); assert.ok(s.due < 86400000); assert.ok(s.ef < 2.5);
  let e = S.srsReview(S.srsInit(), S.GRADE.easy, now); assert.equal(e.ivl, 3);
  assert.ok(before > 0);
});

test('day numbers follow the calendar and never drop below 1', () => {
  assert.equal(S.dayNumber(S.parseISO('2026-09-21'), '2026-09-21'), 1);
  assert.equal(S.dayNumber(S.parseISO('2026-10-01'), '2026-09-21'), 11);
  assert.equal(S.dayNumber(S.parseISO('2026-01-01'), '2026-09-21'), 1);
  assert.equal(S.isoDate(S.dateForDay(11, '2026-09-21')), '2026-10-01');
});

test('scene text names actor, room and set', () => {
  const ch = S.CHARACTERS.find(c => c.h === '我');
  const sc = S.scene(ch, { actors: { w: 'Wonder Woman' }, sets: { o: 'my flat' }, rooms: { 3: 'the bedroom' } });
  assert.match(sc.text, /^Wonder Woman, in the bedroom of my flat, /);
  assert.equal(sc.tone, 3);
});
