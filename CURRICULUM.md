# Curriculum authoring guide

The course is data. Each HSK level lives in one file, `js/data/hskN.js`, and the engine
turns the levels into daily 10-minute lessons automatically. Run `node tools/validate.js`
after every change; CI runs it too and the build fails on any error.

## Level file format

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SENLIN_LEVELS = root.SENLIN_LEVELS || []).push(factory());
})(this, function () {
  'use strict';
  return {
    level: 2,
    name: 'HSK 2',
    components: [                       // NEW props only (not already in components.js or an earlier level)
      { c: '疒', k: 'sickness', prop: 'a hospital gown' }
    ],
    characters: [                       // TEACHING ORDER — 3 per day by default
      { h: '病', p: 'bìng', m: 'illness', c: ['疒', '丙'], s: 'lies in a HOSPITAL GOWN (疒) clutching a THIRD-PLACE MEDAL (丙) — ILLNESS.' }
    ],
    words: [
      { w: '生病', p: 'shēngbìng', m: 'to get sick' }
    ],
    sentences: [
      { zh: '我生病了。', p: 'Wǒ shēngbìng le.', en: 'I got sick.' }
    ]
  };
});
```

## Rules (the validator enforces the starred ones)

Characters
- `h` is exactly one simplified character. ★ No character may appear in two levels.
- `p` is the pinyin **with tone marks** (ā á ǎ à, ü as ǖ ǘ ǚ ǜ). Use the character's most common reading in the level's vocabulary. ★ It must parse to a known initial and final.
- `m` is a short meaning keyword; add the word it appears in when the character rarely stands alone, e.g. `'apple (苹果)'`.
- `c` lists the props: components at a mnemonic level (2–4 items, keep the visual order top→bottom / left→right). ★ Every entry must exist in `components.js`, in a level's `components`, or be a character taught anywhere in the course. A single-stroke primitive can be its own prop (`c: ['不']`) if it is listed in `components`.
- `s` is the scene seed: one sentence, present tense, starting with a verb, that names every prop in CAPITALS with its component in parentheses and ends by landing on the MEANING in capitals. The app prefixes the actor, room and set: “<Actor>, in <room> of <set>, <seed>”. Do not name the actor or the set in the seed. Weird, physical, vivid beats polite.
- Order characters so that high-frequency words unlock early: put both halves of a common word in the same day (three consecutive entries = one day).

Words
- ★ Every character in a word must be taught in this level or an earlier one.
- Only multi-character words. `p` uses tone marks and the spoken tone sandhi (bú shì, yí ge, ní hǎo is written nǐ hǎo). `m` is the English meaning.
- Cover the level's official word list; extra high-frequency words are welcome.

Sentences
- ★ Every character must be taught in this level or an earlier one.
- Natural, short (4–12 characters), useful in real life, and graded: early sentences use only early characters. Include full-width punctuation (。？！，). `p` is the pinyin, `en` the translation.
- Aim for roughly one sentence per two characters in the level.

Components
- Add a component only when no existing prop covers it. Fields: `c` (the component), `k` (one-or-two-word keyword), `prop` (a concrete physical object). ★ No duplicates across files.

## How scheduling works

Characters are chunked in file order (default 3 per day). A word is placed on the first day when all of its characters have been taught, at most 4 words per day; overflow rolls to the next day. Sentences follow the same rule, 3 per day. Levels run back to back; the Progress page shows a milestone at the end of each.

## Checking your work

```bash
node tools/validate.js        # must print OK
node tools/lesson.js 90       # eyeball a day from your level
node tools/ics.js             # regenerate the calendar feed (commit daily.ics)
```
