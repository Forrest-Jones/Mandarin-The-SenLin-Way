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
- Phone screenshots (2–8, 16:9 to 9:16): `node tools/icons.js --screens` captures Today, Levels, Deal Desk and Talk at 1080×1920 into `store/screenshots/`.
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

Play keeps 15% of the first $1M/year (30% above; apply for the 15% tier in Play Console → Monetise). Suggested SKUs (create the same on Apple and Stripe):

| SKU | Price | Notes |
| --- | --- | --- |
| `pro_monthly` | $9.99 / month | 7-day free trial |
| `pro_yearly` | $59.99 / year | the default highlight (50% off) |
| `pro_lifetime` | $149 once | one-time, non-consumable |

Free forever: all of HSK 1 (72 days), tone gym, writing, reviews, tutor with a daily cap. Turn the gate on with `paywall: true` in `js/config.js` and `PAYWALL = "1"` in `server/wrangler.toml`.

## 6. Pre-launch checklist

- [ ] `js/config.js` → `apiBase` set to the deployed worker; `/v1/health` returns providers as expected
- [ ] `.well-known/assetlinks.json` has the real SHA-256 and verifies (Route A)
- [ ] Sign in, sync from two devices, restore a backup
- [ ] Talk works signed-in (cloud tutor) and hits the daily cap gracefully
- [ ] Recorded audio generated (`node tools/audio.js --provider azure`) and committed under `audio/` so voice works on every device
- [ ] HSK 4–6 content passed native review (`tools/review.js` export → editor → `--apply`)
- [ ] Privacy policy and terms reachable from the app (footer links) and the store listing
- [ ] Lighthouse PWA audit green (installable, offline, icons, maskable)
- [ ] Internal testing track for a week with real devices (Android 10+, Chrome 120+)
- [ ] Keystore, passwords and RevenueCat keys backed up outside the repo

## 7. iOS

The TWA route is Android-only. iOS requires Route B. Apple insists in-app digital purchases use StoreKit (RevenueCat handles it), a working "Restore purchases" button (present in `js/native.js` → `billing.restore()`), an account-deletion path (Settings → Reset plus the contact email; add an in-app "Delete account" once the backend exposes it), and a privacy nutrition label mirroring the Data safety answers above.
