/* Mandarin The SenLin Way — deployment configuration
   Everything here is optional. With all values empty the site runs exactly as before:
   no accounts, no server, the learner's own AI key, the device voice.
   Fill in `apiBase` once the Cloudflare Worker in server/ is deployed. */
window.SENLIN_CONFIG = {
  apiBase: 'https://senlin-api.forrestjones2010.workers.dev',   // the Cloudflare Worker in server/ (no trailing slash)
  audioBase: 'audio/',         // pre-generated MP3s from tools/audio.js (audio/index.json)
  sentryDsn: '',               // Sentry browser DSN; empty = errors go to apiBase/v1/errors when signed in, else nowhere
  analytics: 'opt-in',         // 'off' | 'opt-in' (asks once in Settings) | 'on'
  paywall: true,               // true = HSK 2+ (day 73 on) and the Deal Desk need a Pro entitlement; HSK 1 stays free
  freeDays: 72,                // with paywall: days 1–72 (all of HSK 1 at 3 characters a day) are free
  revenuecat: { android: '', ios: '', web: '' },  // public API keys per platform
  checkoutUrl: '',             // optional fallback: a Stripe Payment Link; normally Checkout is created by the server (/v1/billing/checkout)
  plans: [                     // shown on #/pro when the server is not connected; the server's /v1/billing/plans wins otherwise
    { id: 'monthly', name: 'Pro monthly', price: 11.99, currency: 'USD', interval: 'month', trialDays: 0, rcPackage: '$rc_monthly' },
    { id: 'yearly', name: 'Pro yearly', price: 59.99, currency: 'USD', interval: 'year', trialDays: 7, perMonth: 5, savePct: 58, highlight: true, rcPackage: '$rc_annual' },
    { id: 'lifetime', name: 'Pro lifetime', price: 149.99, currency: 'USD', interval: null, trialDays: 0, launchOffer: true, rcPackage: '$rc_lifetime' }
  ],
  version: '2026.09.20'
};
/* A learner (or you, from a phone) can point the site at a server without a commit: Settings → Account → Server URL. */
try { var _o = localStorage.getItem('senlin.apiBase'); if (_o) window.SENLIN_CONFIG.apiBase = JSON.parse(_o) || ''; } catch (e) { /* private mode */ }
