# Mandarin The SenLin Way 森林

A daily **10-minute** Mandarin Chinese program on your own website.
No accounts, no backend, no build step: plain HTML, CSS and JavaScript, deployed to GitHub Pages.

**Live site:** https://forrest-jones.github.io/mandarin-the-senlin-way/

森林 *sēnlín* means forest. 木 is a tree, 林 is woods, 森 is a forest. One tree a day.

## What it does

Every day is one lesson, always the same shape, always ten minutes on a visible clock:

| Minutes | Segment | What happens |
| --- | --- | --- |
| 1:00 | Warm-up | One of the twenty tone pairs, spoken aloud with the device’s Mandarin voice |
| 2:30 | Review | Spaced-repetition flashcards (SM-2), graded Again / Hard / Good / Easy |
| 3:30 | New | Three characters as **movie scenes**: actor (initial) + set (final) + room (tone) + props (components), plus the words they unlock |
| 2:00 | Sentences | Shadow each sentence three times, normal and slow speed |
| 1:00 | Quiz | Five questions; misses feed tomorrow’s review |

The curriculum is **top-down**: a word is never shown before all of its characters have been learned, and a sentence never before all of its words. The scheduler (`js/engine.js`) enforces this automatically, so extending the data extends the course.

- **Days 1–12** Pronunciation Mastery: every initial, final, tone, tone pair and sandhi rule, while you cast your own actors, sets, rooms and props.
- **Days 13–899** Phases 1–6, the full HSK 1–6 road: 2,655 characters, 4,447 words, 1,444 sentences and 86 grammar patterns, one level after another (HSK 1 done by day 72, HSK 2 by 129, HSK 3 by 220, HSK 4 by 368, HSK 5 by 577, HSK 6 by 899).
- **Then** Consolidation: the remaining HSK 6 vocabulary and daily review.

Beyond the daily lesson: **Talk** (a live 1-on-1 AI tutor with role-play scenarios, voice in and out, corrections and session reviews), **Write it** (stroke-order animation and drawing quiz on every character), the **Tone gym**, listening questions in every quiz, a **Review anytime** deck, and a placement setting for learners who already know some Chinese. The site installs to a phone home screen and works offline.

Pages: **Today** (dashboard, catch-up queue, your growing forest), **Lesson** (the timed runner), **Talk** (AI tutor), **Library** (every character, word, sentence, grammar pattern and prop, searchable, with audio), **Cast** (rename actors/sets/rooms/props), **Progress** (streak, heatmap, recall rate), **Method**, **Settings** (start date, pace, voice, AI key, placement, backup).

## The daily push

Three independent ways to receive each day’s lesson:

1. **Calendar feed** — `daily.ics` holds one 10-minute event per lesson day at 07:00 with a deep link to that day (`#/lesson/N`). Subscribe or import it once.
2. **GitHub Actions** — `.github/workflows/daily-lesson.yml` runs every morning (11:00 UTC), renders the day’s lesson with `node tools/lesson.js`, opens it as a GitHub Issue labelled `daily-lesson` (GitHub emails the owner) and commits it to `today.md`.
3. **Claude routine** — a scheduled Claude Code routine reads the same CLI output and sends it as a push notification / email each morning.

## AI tutor

The Talk page calls Claude from the browser through the official `@anthropic-ai/sdk` (loaded from the jsdelivr CDN) with the learner's own API key, which is stored only in `localStorage` and sent only to `api.anthropic.com`. Inside the claude.ai artifact preview it uses the viewer's Claude account through the page's `sample` capability instead, so no key is needed there.

The site, the CLI and the calendar all compute the day from the same start date (`CONFIG.startDate` in `js/engine.js`, changeable per-device in Settings).

## Run locally

```bash
python3 -m http.server 8080      # then open http://localhost:8080
node tools/validate.js           # checks data integrity and ordering
node tools/lesson.js [day|date]  # prints a lesson as Markdown
node tools/ics.js                # regenerates daily.ics
```

## Audio

Pronunciation uses the browser’s Web Speech API with a Chinese (zh-CN) voice, so it works offline once a voice is installed. macOS: add *Tingting* under Accessibility → Spoken Content. Windows: add the Chinese (Simplified) language pack with speech. Chrome ships a Google 普通话 voice when online.

## Extending the curriculum

Each HSK level is one file, `js/data/hskN.js`, holding its characters (in teaching order), words, sentences and any new props; grammar patterns live in `js/data/grammar.js` and conversation scenarios in `js/data/scenarios.js`. See `CURRICULUM.md` for the format and rules, then run `node tools/validate.js` and `node --test tools/test.js`. The validator fails if a word, sentence or pattern uses an untaught character, if a component is missing, if a character is taught twice, or if a pinyin syllable does not parse. Nothing else needs to change.

## Method and credits

The SenLin Way is an original curriculum inspired by the publicly described methods of [Mandarin Blueprint](https://www.mandarinblueprint.com/) (the Hanzi Movie Method, Pronunciation Mastery, top-down learning), Heisig’s *Remembering the Hanzi*, Pimsleur’s graduated recall, the SM-2 spaced-repetition algorithm, Krashen’s comprehensible input and Argüelles’ shadowing. It is not affiliated with any of them. See the Method page on the site.
