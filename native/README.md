# SenLin native shell (Capacitor: Android + iOS)

The web app in the repo root is the product. This folder wraps the same files in a
[Capacitor](https://capacitorjs.com) shell so it can ship on the App Store (where a
Trusted Web Activity is not an option) and, optionally, on Google Play as an
alternative to the TWA in `../twa-manifest.json`.

Nothing in the web app changes. `js/native.js` (loaded by the web app on every
platform) detects Capacitor at runtime and swaps in native voice, microphone,
notifications, haptics, sharing and purchases. On the plain website those same
calls report `available: false` and the app falls back to the browser APIs it
already uses.

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or 22 | `node -v` |
| Android Studio | Ladybug (2024.2) or newer | installs the Android SDK + JDK 17 |
| Xcode | 16+ | macOS only; run it once to accept the licence and install iOS components |
| CocoaPods | 1.15+ | `sudo gem install cocoapods` (iOS only) |

Capacitor 8 requires Android SDK 35 / Gradle 8 and iOS 15 or newer as a deployment
target. Android Studio's SDK Manager handles the Android side.

## 2. First-time setup

    cd native
    npm install
    npm run build          # copies ../index.html, js/, css/, assets/ … into www/
    npx cap add android    # creates native/android/
    npx cap add ios        # creates native/ios/ (macOS)

`www/`, `android/` and `ios/` are generated and git-ignored on purpose; re-create
them on any machine with the three commands above. The Android and iOS projects
are yours to edit afterwards (icons, permissions, plists), so if you make manual
changes inside them, commit them by removing the corresponding line from
`.gitignore`.

## 3. Everyday loop

    npm run build && npx cap sync     # copy web files, install plugins into both projects
    npm run android                    # build + sync + open Android Studio
    npm run ios                        # build + sync + open Xcode

`npx cap run android` / `npx cap run ios` builds and deploys to a connected
device or simulator without opening the IDE.

## 4. Icons and splash

Put `../assets/icon-512.png` and `../assets/icon-maskable-512.png` through
`@capacitor/assets` once the projects exist:

    npx @capacitor/assets generate --iconBackgroundColor '#14a066' --splashBackgroundColor '#14a066' \
        --iconBackgroundColorDark '#0b2a20' --splashBackgroundColorDark '#0b2a20' \
        --assetPath ../assets

Local notifications use a monochrome status-bar icon named `ic_stat_senlin`
(`capacitor.config.json` → `plugins.LocalNotifications.smallIcon`). Add it to
`android/app/src/main/res/drawable*/` (Android Studio → New → Image Asset →
Notification icon) or notifications fall back to the app icon.

## 5. Permissions to declare

Android (`android/app/src/main/AndroidManifest.xml`):

    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="com.android.vending.BILLING" />

iOS (`ios/App/App/Info.plist`):

    <key>NSMicrophoneUsageDescription</key>
    <string>Say it: the microphone scores your Mandarin pronunciation.</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Your speech is transcribed so the tutor can check tones and words.</string>

Both usage strings are shown to the user; Apple rejects builds that omit them.

## 6. Signing and release

### Android

1. Create an upload key once: `keytool -genkey -v -keystore android.keystore -alias senlin -keyalg RSA -keysize 2048 -validity 10000`
   (keep it out of git; `.gitignore` already excludes `*.keystore`).
2. Android Studio → Build → Generate Signed App Bundle → pick the keystore → release → `app-release.aab`.
3. Upload to Play Console (Internal testing first). Play App Signing re-signs it;
   the Play fingerprint goes into `../.well-known/assetlinks.json` (only strictly
   needed for the TWA path, but it also unlocks Android App Links for the shell).

### iOS

1. Apple Developer Program membership (US$99/year).
2. In Xcode: Signing & Capabilities → Team → automatic signing. Bundle id `com.senlinway.mandarin`.
   Add the **In-App Purchase** capability and, if you use them, **Push Notifications** (not needed for local notifications).
3. Product → Archive → Distribute App → App Store Connect → Upload.
4. App Store Connect → TestFlight: the build appears after processing (10–30 min).
   Add internal testers (up to 100, no review) or external testers (needs a light
   beta review). TestFlight builds expire after 90 days.
5. App Store Connect → App → Prepare for Submission: screenshots (6.7" and 6.1"
   iPhone, 13" iPad if you support iPad), description, keywords, privacy policy URL
   (`https://forrest-jones.github.io/Mandarin-The-SenLin-Way/privacy.html`),
   App Privacy questionnaire (see `../PLAY_STORE.md`, the answers are the same),
   age rating 4+, then Submit for Review.

### App Store review notes (what gets apps like this rejected)

* **Digital purchases must use StoreKit** (guideline 3.1.1). The web checkout
  link in `SENLIN_CONFIG.checkoutUrl` must never be shown inside the iOS app; the
  bridge already routes `billing.purchase()` to RevenueCat on native. Do not
  mention "cheaper on the website" anywhere in the app.
* RevenueCat handles StoreKit 2 and Play Billing with one API; configure products
  in App Store Connect and Play Console with the **same product ids**
  (`senlin_pro_monthly`, `senlin_pro_yearly`, `senlin_pro_lifetime`), attach them
  to a RevenueCat entitlement named `pro`, and paste the public SDK keys into
  `../js/config.js` → `revenuecat.ios` / `revenuecat.android`.
* Provide a **Restore Purchases** button (the bridge exposes `billing.restore()`;
  the Settings page shows it when `isNative`).
* Sign in must be optional, or offer Sign in with Apple when other third-party
  logins exist. Ours is email-code only, so no Apple sign-in is required.
* Explain in the review notes that the AI tutor sends conversation text to
  Anthropic and that content is filtered; give the reviewer a test account if the
  paywall is on (`paywall: true` in `config.js`).
* Minimum functionality (4.2): the app must feel like an app, not a website. It
  does: offline lessons, native voice, notifications, haptics.
* The account deletion path (Settings → Reset, and the email in the privacy
  policy) satisfies guideline 5.1.1(v).

## 7. How the bridge detects native

`../js/native.js` runs on both platforms:

    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    const platform = isNative ? window.Capacitor.getPlatform() : 'web';   // 'android' | 'ios' | 'web'

Inside the shell, Capacitor injects `window.Capacitor` and registers every
installed plugin under `window.Capacitor.Plugins` (`TextToSpeech`,
`SpeechRecognition`, `LocalNotifications`, `Haptics`, `Share`, `Purchases`).
The bridge reads them from there, so no bundler or `import` is needed and the
same `<script src="js/native.js">` tag works on GitHub Pages. If a plugin is
missing (or the site runs in a normal browser), the corresponding
`SenLinNative.*.available` is `false` and the app keeps using `speechSynthesis`,
`webkitSpeechRecognition`, `navigator.share` and the web checkout link.

Quick check in Safari/Chrome devtools attached to the app:

    SenLinNative.isNative            // true
    SenLinNative.platform            // 'ios' or 'android'
    SenLinNative.tts.available       // true
    await SenLinNative.billing.entitled()

## 8. Troubleshooting

* `npx cap sync` says "web assets directory (www) does not exist": run `npm run build` first.
* Android build fails on `compileSdk`: open Android Studio's SDK Manager and install API 35.
* iOS pod install fails: `cd ios/App && pod repo update && pod install`.
* Speech recognition returns nothing on Android: the device needs the Google app
  (Speech Services) installed; emulators often lack it.
* Purchases return `plan: 'free'` on a real device: the sandbox/test account must be
  signed in (Android: licence tester in Play Console; iOS: Sandbox Apple ID in
  Settings → App Store).
