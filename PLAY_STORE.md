# Publishing Mandarin The SenLin Way on Google Play (and the App Store)

The site is already an installable PWA. This guide turns it into a paid app in the stores. The store copy lives in `store/listing.md`; the Android wrapper config is `twa-manifest.json`; the iOS/Android native shell is `native/`.

Two routes. **Route A (Trusted Web Activity)** ships the live website inside an Android app in about an hour and is the one to start with. **Route B (Capacitor)** builds real Android and iOS apps with native voice, notifications and in-app purchases through RevenueCat; use it for iOS and once Route A is earning.

## 0. What you need to create yourself

| Account | Why | Cost |
| --- | --- | --- |
| Google Play Console (play.google.com/console) | publish on Android | $25 once |
| Apple Developer Program (developer.apple.com) | iOS (Route B only) | $99/year |
| Cloudflare + the providers in `server/README.md` | accounts, sync, tutor, voice | free tiers |
| RevenueCat (revenuecat.com) | subscriptions on both stores, one dashboard | free to $2.5k/month revenue |
| Stripe (web purchases, optional) | Pro on the website | 2.9% + 30¢ |

## 1. Route A — Trusted Web Activity with Bubblewrap

1. Install: Node 22, JDK 17, Android SDK (Android Studio installs both), then `npm i -g @bubblewrap/cli`.
2. From the repo root: `bubblewrap build` reads the checked-in `twa-manifest.json` (package `com.senlinway.mandarin`, host `forrest-jones.github.io`, start URL `/Mandarin-The-SenLin-Way/`). The first run asks for a signing key: choose a new `android.keystore`, alias `senlin`, and **back the keystore and passwords up** — losing them means you can never update the app.
   - Alternative without Bubblewrap: open https://pwabuilder.com, paste `https://forrest-jones.github.io/Mandarin-The-SenLin-Way/`, choose Android → download the package. Same result, same Play Billing option.
3. Play Console → Create app → upload `app-release-bundle.aab` to **Internal testing** first.
   - You do not have to build it yourself: the *Build Android app* workflow publishes every build at the `android-latest` release. Direct links: [app-release-bundle.aab](https://github.com/Forrest-Jones/Mandarin-The-SenLin-Way/releases/download/android-latest/app-release-bundle.aab) (what Play wants) and [app-release-signed.apk](https://github.com/Forrest-Jones/Mandarin-The-SenLin-Way/releases/download/android-latest/app-release-signed.apk) (install on a phone directly for testing).
4. **Digital Asset Links** (removes the browser bar). Play Console → Setup → App signing → copy the SHA-256 certificate fingerprint into `.well-known/assetlinks.json` (replace `REPLACE_WITH_SHA256_FROM_PLAY_CONSOLE`), commit, push, wait for the Pages deploy, then verify at `https://forrest-jones.github.io/Mandarin-The-SenLin-Way/.well-known/assetlinks.json` (`.nojekyll` makes GitHub Pages serve dot-folders).
5. Promote to production when the internal test looks right.

**Charging with Route A.** `twa-manifest.json` enables Play Billing. Two options:
- Simplest: keep purchases on the web (Stripe Payment Link in `js/config.js` → `checkoutUrl`). Google allows this for a TWA only if you do not sell digital goods through the Play app itself, so make sure the app shows no "Go Pro" button (leave `paywall: false`) and market Pro on the website.
- Store-native: implement the Digital Goods API + Payment Request API in the web app (the TWA proxies them to Play Billing). RevenueCat does not support TWAs; that is the reason to move to Route B when you want in-app purchases on Android.

## 2. Route B — Capacitor apps (Android + iOS)

See `native/README.md` for the step-by-step. In short: `cd native && npm install && npm run build && npx cap add android && npx cap add ios && npx cap sync`, open in Android Studio / Xcode, sign, upload. `js/native.js` already bridges native text-to-speech, speech recognition, local notifications (the daily 10-minute reminder), haptics, share, and RevenueCat purchases (`entitlement` id `pro`, offering `default`). Fill in the RevenueCat public keys in `js/config.js` (`revenuecat.android`, `revenuecat.ios`) and set the webhook in `server/README.md`.

## 3. Store listing

Copy every field from `store/listing.md` (title, short and full description, both measured against the limits). Assets:
- App icon: `assets/icon-512.png` (512×512, PNG, no alpha problems) — Play also uses the maskable version on the device.
- Feature graphic: `store/feature-graphic-1024x500.png`.
- Phone screenshots (2–8, 16:9 to 9:16): `node tools/icons.js --screens` captures Today, Levels, Deal Desk and Talk at 1080×1920 into `store/screenshots/`, each with a high-contrast caption band stating the benefit (the first two or three screenshots do most of the converting). Upload them in that order.
- Category: Education. Tags: language learning, Chinese, Mandarin, HSK.
- Contact email and the privacy policy URL: `https://forrest-jones.github.io/Mandarin-The-SenLin-Way/privacy.html`.

## 4. Policy forms

**Content rating questionnaire**: Education/Reference app; no violence, sexual content, profanity, gambling, drugs; users can communicate only with an AI, not with each other; no user-generated content shared with others; no location sharing. Expected rating: Everyone / PEGI 3.

**Data safety** (answer from `privacy.html`):
- Collects: email address (account, optional), app activity (opt-in analytics, event names only), crash logs. Not collected: location, contacts, photos, financial info (payments are handled by Google Play / Stripe), device IDs, advertising ID.
- Shared with third parties: messages typed to the tutor go to Anthropic (AI processing); audio for pronunciation feedback goes to the speech provider (Microsoft/Google/Deepgram). Not sold. Not used for ads.
- Data is encrypted in transit; users can request deletion (Settings → Reset, email the owner). Account creation is optional.
- Sensitive permissions: RECORD_AUDIO (pronunciation feedback), POST_NOTIFICATIONS (daily reminder). Route A needs none declared beyond what Chrome provides.

**Ads**: none. **Target audience**: 13+ (do not tick "designed for children").

**Trademark wording**: always "HSK-aligned"; never "official HSK course" and never any logo of Hanban / CLEC / Chinese Testing International. `terms.html` carries the disclaimer.

## 5. Pricing

The market for serious Mandarin apps sits at $12–15 a month and $70–120 a year (HelloChinese $11.99/$69.99, Du Chinese $14.99/$79.99/$119.99 lifetime, Skritter $14.99, Hack Chinese $12 or $8 billed annually). SenLin matches the leaders on monthly so the price does not signal "cheaper means worse" (monthly is mostly the anchor anyway) and undercuts on annual, because a new app with no reviews needs an edge and monthly subscribers to learning apps churn within a few months: a prepaid year at $60 is worth more than a $12 monthly.

| SKU (all three stores) | Price | Marketed as | Notes |
| --- | --- | --- | --- |
| `pro_monthly` | **$11.99 / month** | "$11.99 a month, cancel any time" | the anchor; no trial |
| `pro_yearly` | **$59.99 / year** | **"$5 a month, billed yearly"** — the highlighted plan | **7-day free trial**; about 58% off monthly |
| `pro_lifetime` | **$149.99 once** | "Launch offer" | optional; retire it once reviews arrive |

Free forever: all of HSK 1 (72 days at the default pace), tone gym, writing, reviews, the tutor with a daily cap. Turn the gate on with `paywall: true` in `js/config.js` and `PAYWALL = "1"` in `server/wrangler.toml`.

Positioning note: if the audience turns out to be intermediate-plus learners and Deal Desk professionals rather than casual beginners, there is pricing power for $14.99 / $79.99 (Du Chinese, Skritter territory). Change the numbers in one place on the server (`server/src/billing.js` → `PLANS`) plus the store consoles; the pricing page reads the server catalogue.

Fees: Google and Apple keep 15% on the first $1M a year (apply for the small-business tier in each console), so $59.99 nets about $51. The same yearly plan sold on the website through Stripe nets about $58, which is why the site's own pricing page (`#/pro`) sells through Stripe Checkout and the store apps only add RevenueCat on top. Store rules allow this as long as the Android/iOS builds themselves do not link out to the web checkout.

Where the rails live: `server/README.md` → *Billing* (Stripe products, prices, trial, webhook, Customer Portal; RevenueCat products, entitlement `pro`, offering packages `$rc_monthly`, `$rc_annual`, `$rc_lifetime`).

## 6. Pre-launch checklist

- [ ] `js/config.js` → `apiBase` set to the deployed worker; `/v1/health` returns providers as expected
- [ ] `.well-known/assetlinks.json` has the real SHA-256 and verifies (Route A)
- [ ] Sign in, sync from two devices, restore a backup
- [ ] Talk works signed-in (cloud tutor) and hits the daily cap gracefully
- [ ] Recorded audio generated (Actions → *Generate audio* with the `GOOGLE_TTS_KEY` secret, HSK 1 first, then all levels) and committed under `audio/` so voice works on every device
- [ ] HSK 4–6 content passed native review (`tools/review.js` export → editor → `--apply`)
- [ ] Privacy policy and terms reachable from the app (footer links) and the store listing
- [ ] Lighthouse PWA audit green (installable, offline, icons, maskable)
- [ ] Internal testing track for a week with real devices (Android 10+, Chrome 120+)
- [ ] Keystore, passwords and RevenueCat keys backed up outside the repo
- [ ] Listing title / short / full description pasted exactly from `store/listing.md` (section 8 below explains why each is worded as it is)

## 7. iOS

The TWA route is Android-only. iOS requires Route B. Apple insists in-app digital purchases use StoreKit (RevenueCat handles it), a working "Restore purchases" button (present in `js/native.js` → `billing.restore()`), an account-deletion path (Settings → Reset plus the contact email; add an in-app "Delete account" once the backend exposes it), and a privacy nutrition label mirroring the Data safety answers above.

## 8. Ranking on Google Play (ASO) — the plan

Play ranks on two things: the text it indexes, and how people behave once they see and install the app. Both are in our hands.

**Text (indexed like a search engine)**
- Title (30 chars, heaviest weight): `SenLin: Learn Mandarin Chinese`. Brand + the highest-volume phrase. No "Free", "#1", emoji.
- Short description (80 chars, second in weight and the line people read before tapping): `Learn Chinese in 10 minutes a day: HSK 1–6 words, tones, writing, AI tutor.`
- Full description (4,000 chars, fully indexed): headed sections, bullets, natural repeats of *learn Chinese*, *Mandarin*, *HSK*, *tones*, *AI tutor*, about 2–3% each, never a keyword wall. Copy lives in `store/listing.md`.
- Package name is permanent and already carries the core keyword: `com.senlinway.mandarin`.
- Run store listing experiments in Play Console from day one: title alternate, the two short-description alternates in `store/listing.md`, icon and first screenshot.

**Conversion (a keyword we rank for but nobody installs from sinks)**
- Icon: the green 森 tile reads on light and dark backgrounds; keep it uncluttered.
- Screenshots: benefit in a caption on each, benefit-first order (Today → Talk → Levels → Deal Desk). Add a 15–30 s portrait video of one lesson once there are real lessons to film.
- The listing promises exactly what the free tier delivers (all of HSK 1). No intent mismatch, so fewer day-1 uninstalls.

**Technical health (Android vitals)**
- Thresholds Google demotes past: crash rate 1.09% (8% on any one device), ANR 0.47%. The TWA shell is a thin Chrome wrapper, so the vitals that matter are the web app's: no uncaught errors (CI runs the e2e suite with a console-error assertion), a service worker that never serves a broken shell, and `.well-known/assetlinks.json` verified so Play never shows the browser bar.
- Keep the bundle small: the TWA is ~2 MB; the site loads HSK 4–6 lazily and audio on demand, and the published copy is minified at deploy time (sources stay readable on `main`).
- Every build sets `versionCode` from the workflow run number and targets at least API 35 (the template already compiles against the newest SDK), so each upload is accepted by Play without hand edits.

**Ratings and reviews**
- Stay above 4.0 or lose "similar apps" placement. The app asks for a rating only at a good moment: after a completed lesson on a streak of three or more, at most once every 90 days, never on a cold open or after an error (`js/app.js` → `reviewPrompt`). In the Capacitor build this becomes the native In-App Review API; in the TWA it opens the Play listing.
- Reply to every 1- and 2-star review within a day, fix, then ask if they would update. Google reads the text of reviews, so replies that name the fix help twice.

**Velocity and retention**
- A steady trickle of installs beats a spike: announce in waves (personal network, HSK and Chinese-learning subreddits and Discords, LinkedIn for the Deal Desk angle, then paid UAC once organic conversion is known).
- Day-1 / 7 / 30 retention is the ranking signal that compounds: the daily reminder, the streak, the catch-up queue and the calendar feed exist for it. Watch the Play Console retention panel weekly; a day-1 drop means the first lesson, not marketing.
- Localise metadata (title, short, full, screenshots) by hand, not machine, for tier-one markets in this order: Spanish, Portuguese (BR), German, French, Japanese, Korean, then Traditional Chinese for Taiwan and Hong Kong learners of Putonghua. Hand-written drafts for all seven are in `store/listing-localized.md`; each needs one native read-through before it is pasted into Play Console → *Add translation*. In-app text stays English until the metadata proves a market.
