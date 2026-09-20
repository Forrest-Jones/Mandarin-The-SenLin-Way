/* Mandarin The SenLin Way — deployment configuration
   Everything here is optional. With all values empty the site runs exactly as before:
   no accounts, no server, the learner's own AI key, the device voice.
   Fill in `apiBase` once the Cloudflare Worker in server/ is deployed. */
window.SENLIN_CONFIG = {
  apiBase: '',                 // e.g. 'https://senlin-api.<your-subdomain>.workers.dev' (no trailing slash)
  audioBase: 'audio/',         // pre-generated MP3s from tools/audio.js (audio/index.json)
  sentryDsn: '',               // Sentry browser DSN; empty = errors go to apiBase/v1/errors when signed in, else nowhere
  analytics: 'opt-in',         // 'off' | 'opt-in' (asks once in Settings) | 'on'
  paywall: false,              // true = HSK 3+ and the Deal Desk need a Pro entitlement
  freeDays: 72,                // with paywall: days 1–72 (all of HSK 1 at 3 characters a day) are free
  revenuecat: { android: '', ios: '', web: '' },  // public API keys per platform
  checkoutUrl: '',             // web purchase page (Stripe Payment Link / RevenueCat Web Billing)
  version: '2026.09.20'
};
/* A learner (or you, from a phone) can point the site at a server without a commit: Settings → Account → Server URL. */
try { var _o = localStorage.getItem('senlin.apiBase'); if (_o) window.SENLIN_CONFIG.apiBase = JSON.parse(_o); } catch (e) { /* private mode */ }
