# Mandarin The SenLin Way 森林

A daily **10-minute** Mandarin Chinese program on your own website, installable as an app.
No build step: plain HTML, CSS and JavaScript deployed to GitHub Pages, plus an optional Cloudflare Worker backend (`server/`) for accounts, sync, the AI tutor and voice.

**Live site:** https://forrest-jones.github.io/Mandarin-The-SenLin-Way/

森林 *sēnlín* means forest. 木 is a tree, 林 is woods, 森 is a forest. **Building your Mandarin Word Forest, one tree at a time.**

## Launch status

| Piece | State |
| --- | --- |
| Website (PWA) | live at the link above, CI-tested on every push |
| API worker | live at `https://senlin-api.forrestjones2010.workers.dev` (accounts, sync, backups, Stripe, reminders, cron) |
| Payments | Stripe **live**: product, three prices, webhook and Customer Portal created by the deploy; the paywall is on (HSK 1 free, HSK 2–6 and the Deal Desk need Pro; `OWNER_EMAIL` accounts are always Pro) |
| AI tutor | live through the worker with the Anthropic key; the daily content review workflow uses the same key |
| Android | signed bundle and APK published by the *Build Android app* workflow at the `android-latest` release (direct links in `PLAY_STORE.md`); upload the `.aab` in Play Console → Internal testing once identity verification clears. `.well-known/assetlinks.json` already carries the signing fingerprint |
| iOS | Xcode project generated and committed at `native/ios/App/App.xcworkspace`; open on a Mac, choose your Team, Archive, upload to App Store Connect |
| Still needs the owner | Play Console identity verification, then the first upload; Apple Developer Program ($99/yr); a verified sending domain in Resend so sign-in emails reach everyone (today they reach the owner only, so password sign-in is the default); a `GOOGLE_TTS_KEY` secret so the *Generate audio* workflow can record every word and sentence with a licensed WaveNet voice (the whole course fits Google's free monthly allowance; until then phones use their built-in Chinese voice); optional `DEEPGRAM_API_KEY` for speech-to-text on iPhone |

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

**Levels.** The Levels page defines each HSK level as the test does (vocabulary, CEFR equivalent, exam format, the HSK Standard Course units, typical study hours) and shows the date you reach it at your pace. Every official HSK 2.0 word is taught at its listed level.

**Deal Desk.** A business track for cross-border private-equity and venture-capital work: 12 units (people and titles, fund terms, sourcing, valuation and term sheets, due diligence, negotiation, closing and FX/ODI mechanics, legal, exits, banquets, numbers, follow-up) with 181 terms, 40 closing phrases and worked dialogues. Two terms and a phrase join every lesson from Day 13, and six deal-room role-plays live in Talk.

Beyond the daily lesson: **Talk** (a live 1-on-1 AI tutor with role-play scenarios, voice in and out, corrections and session reviews), **Write it** (stroke-order animation and drawing quiz on every character), the **Tone gym**, listening questions in every quiz, a **Review anytime** deck, and a placement setting for learners who already know some Chinese. The site installs to a phone home screen and works offline.

Pages: **Today** (dashboard, catch-up queue, your growing forest), **Lesson** (the timed runner), **Talk** (AI tutor), **Library** (every character, word, sentence, grammar pattern and prop, searchable, with audio), **Cast** (rename actors/sets/rooms/props), **Progress** (streak, heatmap, recall rate), **Method**, **Settings** (start date, pace, voice, AI key, placement, backup).

## The daily push

Three independent ways to receive each day’s lesson:

1. **Calendar feed** — `daily.ics` holds one 10-minute event per lesson day at 07:00 with a deep link to that day (`#/lesson/N`). Subscribe or import it once.
2. **GitHub Actions** — `.github/workflows/daily-lesson.yml` runs every morning (11:00 UTC), renders the day’s lesson with `node tools/lesson.js`, opens it as a GitHub Issue labelled `daily-lesson` (GitHub emails the owner) and commits it to `today.md`.
3. **Claude routine** — a scheduled Claude Code routine reads the same CLI output and sends it as a push notification / email each morning.

## AI tutor

The Talk page calls Claude three ways, in this order: signed-in learners go through the backend (`/v1/ai/chat`, key on the server, per-user limits); inside the claude.ai artifact preview it uses the viewer's Claude account through the page's `sample` capability; otherwise it uses the learner's own API key through the official `@anthropic-ai/sdk` (jsdelivr CDN), stored only in `localStorage` and sent only to `api.anthropic.com`.

## Backend, accounts and apps

`js/config.js` is the only file to edit when you deploy the extras. Everything is off until you fill it in.

| Piece | Where | What it adds |
| --- | --- | --- |
| `server/` | Cloudflare Worker + D1 + KV (`server/README.md`, `server/API.md`) | email-code sign-in, cross-device sync with automatic backups, AI proxy with metering and rate limits, licensed cloud voice (Azure/Google), cloud speech-to-text for iOS/Safari, opt-in analytics, error reports, RevenueCat/Stripe webhooks, admin stats |
| `js/cloud.js` | site | the Settings → Account card, sync merge, cloud tutor/voice/recogniser, telemetry (Sentry when `sentryDsn` is set) |
| `js/native.js` + `native/` | Capacitor | Android and iOS shells with native TTS/STT, daily reminder notifications, haptics, RevenueCat purchases |
| `twa-manifest.json`, `.well-known/assetlinks.json`, `store/` | Play Store | Bubblewrap/PWABuilder Trusted Web Activity, icons, feature graphic, screenshots, listing copy; the full guide is `PLAY_STORE.md`. **`.github/workflows/android.yml` builds the signed Play bundle on every run** (signing key kept in the worker's private KV, fingerprint written into assetlinks.json) and uploads it to Play's internal track when a `PLAY_SERVICE_ACCOUNT_JSON` secret exists |
| `.github/workflows/native.yml` | App Store | macOS runner generates and commits the Capacitor `native/ios` and `native/android` projects and compiles the iOS app for the simulator; open the workspace in Xcode, pick your Team, Archive, upload |
| `tools/audio.js` → `audio/` | site | pre-generated MP3s from a licensed studio voice (≈ $1.50 one-off for the whole course); the site plays them first, then the device voice, then the cloud voice |
| `tools/review.js` → `review/` | editors | CSV export of HSK 4–6 sentences, grammar and business lines for a native-speaker review pass, and `--apply` to read it back |
| `js/loader.js` | site | HSK 4–6 (250 KB gzipped) load lazily, so first paint only needs HSK 1–3 |
| `tests/e2e/` | CI | Playwright smoke, navigation, lesson, settings, offline, mobile (Pixel 7) and axe accessibility checks on every push |
| `privacy.html`, `terms.html` | site | required by both stores; linked from the footer |

Daily reminder: Settings → Daily reminder subscribes the browser or the Android app to Web Push (the worker's cron sends it at the chosen local time, no email provider needed); the iOS/Android Capacitor shells schedule a local notification instead. The calendar feed remains for people who prefer it.

Sign-in: a 6-digit email code when the worker has an email provider (`RESEND_API_KEY`), otherwise email + password (PBKDF2, rate limited). Both give the same account, sync, Pro and tutor allowance.

Voice sources: the site never calls an unofficial endpoint. Recorded audio → native app voice → device Web Speech voice → cloud voice (signed in). Speech recognition: native app → browser (Chrome/Edge/Android) → cloud recogniser (signed in, any browser with a microphone).

**SenLin Pro** (`#/pro`): HSK 1 stays free forever; Pro is $11.99 a month, $59.99 a year ("$5 a month", 7-day free trial) or $149.99 lifetime as a launch offer. The website sells through Stripe Checkout created by the worker (`/v1/billing/checkout`, Customer Portal for cancellations, webhooks flip the plan), and the store apps through RevenueCat with the same three SKUs. The paywall is on: `paywall: true` in `js/config.js` and `PAYWALL = "1"` on the worker put HSK 2–6 and the Deal Desk behind Pro (set both to off to open everything); accounts listed in `OWNER_EMAIL` on the worker are always Pro. Setup steps: `server/README.md` → Billing; pricing rationale: `PLAY_STORE.md` → Pricing.

The site, the CLI and the calendar all compute the day from the same start date (`CONFIG.startDate` in `js/engine.js`, changeable per-device in Settings).

## Run locally

```bash
python3 -m http.server 8080      # then open http://localhost:8080
node tools/validate.js           # checks data integrity and ordering
node tools/lesson.js [day|date]  # prints a lesson as Markdown
node tools/ics.js                # regenerates daily.ics
npm install && npm test          # data checks + unit tests (tools/ and server/)
npm run e2e                      # Playwright end-to-end suite (needs Chromium: npx playwright install chromium)
node tools/audio.js --dry-run    # count utterances and estimate the cost of recording them
node tools/review.js             # export HSK 4–6 text for native review
node tools/icons.js              # regenerate PNG icons and the feature graphic
```

## Audio

Pronunciation plays recorded audio when `audio/` has been generated, otherwise the browser’s Web Speech API with a Chinese (zh-CN) voice, so it works offline once a voice is installed. macOS: add *Tingting* under Accessibility → Spoken Content. Windows: add the Chinese (Simplified) language pack with speech. Chrome ships a Google 普通话 voice when online.

## Extending the curriculum

Each HSK level is one file, `js/data/hskN.js`, holding its characters (in teaching order), words, sentences and any new props; grammar patterns live in `js/data/grammar.js` and conversation scenarios in `js/data/scenarios.js`. See `CURRICULUM.md` for the format and rules, then run `node tools/validate.js` and `node --test tools/test.js`. The validator fails if a word, sentence or pattern uses an untaught character, if a component is missing, if a character is taught twice, or if a pinyin syllable does not parse. Nothing else needs to change.

## Method and credits

The SenLin Way is an original curriculum. It builds on James Heisig’s component mnemonics, Paul Pimsleur’s graduated recall, the SM-2 spaced-repetition algorithm, Stephen Krashen’s comprehensible input, Alexander Argüelles’ shadowing, and the published HSK vocabulary lists. Stroke-order animations use the MIT-licensed [Hanzi Writer](https://hanziwriter.org) and Make Me a Hanzi data. The course is HSK-aligned; it is not affiliated with or endorsed by the HSK's owners. See the Method page on the site.
