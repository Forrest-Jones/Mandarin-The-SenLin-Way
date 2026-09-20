#!/usr/bin/env node
/* Validates the curriculum data and prints the schedule summary.
   Run: node tools/validate.js   (exit code 1 on any error)                    */
'use strict';
const S = require('../js/engine.js');

const errors = [], warnings = [];
const seen = new Set();
const compSet = new Set(S.COMPONENTS.map(c => c.c));
const charSet = new Set(S.CHARACTERS.map(c => c.h));
const initialKeys = new Set(S.PINYIN.initials.map(i => i.key));
const finalKeys = new Set(S.PINYIN.finals.map(f => f.key));

/* characters */
for (const ch of S.CHARACTERS) {
  if (seen.has(ch.h)) errors.push(`duplicate character ${ch.h}`); seen.add(ch.h);
  if (Array.from(ch.h).length !== 1) errors.push(`${ch.h}: must be one character`);
  const py = S.parsePinyin(ch.p);
  if (!initialKeys.has(py.actorKey)) errors.push(`${ch.h} ${ch.p}: unknown actor key "${py.actorKey}"`);
  if (!finalKeys.has(py.final)) errors.push(`${ch.h} ${ch.p}: unknown final "${py.final}"`);
  if (py.tone < 1 || py.tone > 5) errors.push(`${ch.h}: bad tone`);
  if (!ch.c || !ch.c.length) errors.push(`${ch.h}: no components`);
  (ch.c || []).forEach(c => { if (!compSet.has(c) && !charSet.has(c)) errors.push(`${ch.h}: component "${c}" is not in components.js`); });
  if (!ch.s || ch.s.length < 15) errors.push(`${ch.h}: scene seed missing/too short`);
  if (!ch.m) errors.push(`${ch.h}: meaning missing`);
}
/* components referenced by no character */
const used = new Set(S.CHARACTERS.flatMap(c => c.c));
S.COMPONENTS.forEach(c => { if (!used.has(c.c)) warnings.push(`component ${c.c} (${c.k}) is never used`); });

/* words & sentences must only use taught characters */
const han = s => Array.from(s).filter(c => /\p{Script=Han}/u.test(c));
const seenW = new Set();
for (const w of S.WORDS) {
  if (seenW.has(w.w)) errors.push(`duplicate word ${w.w}`); seenW.add(w.w);
  han(w.w).forEach(c => { if (!charSet.has(c)) errors.push(`word ${w.w}: character ${c} is never taught`); });
  if (!w.p || !w.m) errors.push(`word ${w.w}: pinyin/meaning missing`);
}
for (const s of S.SENTENCES) {
  han(s.zh).forEach(c => { if (!charSet.has(c)) errors.push(`sentence "${s.zh}": character ${c} is never taught`); });
  if (!s.p || !s.en) errors.push(`sentence "${s.zh}": pinyin/english missing`);
}
/* pronunciation days reference real keys */
S.PINYIN.pronunciationDays.forEach((d, i) => {
  (d.initials || []).forEach(k => { if (!initialKeys.has(k)) errors.push(`pron day ${i + 1}: unknown initial ${k}`); });
  (d.finalsIntro || []).forEach(k => { if (!finalKeys.has(k)) errors.push(`pron day ${i + 1}: unknown final ${k}`); });
  (d.props || []).forEach(k => { if (!compSet.has(k)) errors.push(`pron day ${i + 1}: unknown prop ${k}`); });
  (d.pairs || []).forEach(k => { if (!S.PINYIN.tonePairs.find(t => t.pair === k)) errors.push(`pron day ${i + 1}: unknown tone pair ${k}`); });
});
/* every final introduced exactly once in the pronunciation phase */
const introduced = S.PINYIN.pronunciationDays.flatMap(d => d.finalsIntro || []);
S.PINYIN.finals.forEach(f => { const n = introduced.filter(x => x === f.key).length; if (n !== 1) errors.push(`final ${f.key} introduced ${n} times`); });
const introducedI = S.PINYIN.pronunciationDays.flatMap(d => d.initials || []);
S.PINYIN.initials.forEach(f => { const n = introducedI.filter(x => x === f.key).length; if (n !== 1) errors.push(`initial ${f.key} introduced ${n} times`); });

/* schedule */
const days = S.buildSchedule();
const st = S.curriculumStats(days);
const lessons = [];
for (let d = 1; d <= days.length; d++) {
  try { lessons.push(S.buildLesson(d, days, {}, null, Date.now())); }
  catch (e) { errors.push(`buildLesson(${d}) threw: ${e.message}`); }
}
lessons.forEach(l => { if (l.type !== 'pron' && l.quiz.length < 3) warnings.push(`day ${l.day}: quiz has only ${l.quiz.length} questions`); });
const emptyWordDays = days.filter(d => d.type === 'chars' && !d.words.length).map(d => d.day);

console.log(`Mandarin The SenLin Way — curriculum check`);
console.log(`  characters: ${st.characters}   words: ${st.words}   sentences: ${st.sentences}   components: ${st.components}`);
console.log(`  pronunciation days: ${st.pronDays}   total scheduled days: ${st.days}`);
console.log(`  character days without a new word: ${emptyWordDays.join(', ') || 'none'}`);
warnings.forEach(w => console.log('  warn: ' + w));
if (errors.length) { errors.forEach(e => console.error('  ERROR: ' + e)); process.exit(1); }
console.log('  OK');
