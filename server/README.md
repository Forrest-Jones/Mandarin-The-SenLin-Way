# SenLin API — the backend

A single Cloudflare Worker (no runtime dependencies) that gives the static site accounts, cross-device sync with automatic backups, an AI-tutor proxy that keeps the Anthropic key on the server with per-user metering and rate limits, a licensed cloud voice (Azure or Google), cloud speech-to-text for iOS/Safari, privacy-respecting analytics, error reports, and the RevenueCat / Stripe webhooks that turn purchases into a `pro` plan.

Everything is optional. With `apiBase` empty in `js/config.js` the site runs exactly as before.

- `src/worker.js` routes → `auth.js`, `sync.js`, `ai.js`, `tts.js`, `stt.js`, `events.js`, `billing.js`, `limits.js`, `jwt.js`, `db.js`, `cors.js`, `sse.js`, `util.js`
- `schema.sql` D1 tables · `wrangler.toml` bindings and vars · `API.md` every endpoint with curl examples
- `test/` 23 node:test cases with in-memory D1/KV fakes: `npm test`

## Deploy from GitHub Actions (paste keys in GitHub, never in Cloudflare)

Add these GitHub repository secrets (GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret) and push, or run the "Deploy API worker" workflow from the Actions tab:

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → profile icon → My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers"; before creating, under Permissions add *Account → D1 → Edit* and *Account → Workers KV Storage → Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → Workers & Pages → right-hand column "Account ID" (or the 32-character id in the dashboard URL) |
| `JWT_SECRET`, `ADMIN_KEY` | any long random strings |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com/apikeys |
| `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `DEEPGRAM_API_KEY`, `AZURE_TTS_KEY` + `AZURE_TTS_REGION` | each provider, when you are ready |

The workflow deploys the worker (provisioning D1 and KV on the first run), pushes every secret you added into it, and, when `ADMIN_KEY` and `STRIPE_SECRET_KEY` are both present, runs the one-shot Stripe setup and prints the result in the job log. The worker URL is printed by the deploy step; paste it into the site (Settings → Account → Connect your server).

## Deploy from the Cloudflare Git integration (zero commands)

Create the project once: dash.cloudflare.com → Workers & Pages → **Create** → **Workers** tab → **Import a repository** (connect GitHub if asked) → pick `Mandarin-The-SenLin-Way` → project name `senlin-api`, root directory `/`, no build command, deploy command `npx wrangler deploy` → **Create and deploy**. From then on every push to `main` deploys the worker. The root `wrangler.toml` points at `server/src/worker.js`, so the default build settings work: no build command, deploy command `npx wrangler deploy`. The D1 database and KV namespace are provisioned automatically on the first deploy (no ids in the config), and the worker creates its own tables on the first request, so there is no migration step.

After the first deploy, two things in the dashboard, Workers & Pages → **senlin-api** → Settings → Variables and Secrets:

1. Add the secrets. Required for anything to work: `JWT_SECRET` (any long random string). For sign-in emails: `RESEND_API_KEY` (and set `EMAIL_FROM` to an address on a domain verified in Resend). For Talk: `ANTHROPIC_API_KEY`. For the cloud voice and recogniser: `AZURE_TTS_KEY` + `AZURE_TTS_REGION` (or Google), `DEEPGRAM_API_KEY`. `GET /v1/health` lists what is still `missing`.
2. Copy the worker URL (`https://senlin-api.<your-subdomain>.workers.dev`) into `apiBase` in `js/config.js` and push, **or** open the site → Settings → Account → *Connect your server* and paste it there (stored on that device only).

The GitHub Actions workflow `.github/workflows/deploy-worker.yml` does the same deploy when the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets exist, and skips itself otherwise.

## Deploy by hand in 15 minutes

1. **Cloudflare account** (free tier is enough to start): https://dash.cloudflare.com
2. **Tools**: `cd server && npm install && npx wrangler login`
3. **Database + cache**: nothing to do; the first `deploy` provisions them and the worker creates its tables (`npm run db:create` + `npm run db:migrate` remain for the manual route).
4. **Secrets** (each prompts for the value):
   ```bash
   openssl rand -hex 32 | npx wrangler secret put JWT_SECRET
   npx wrangler secret put ANTHROPIC_API_KEY      # console.anthropic.com
   npx wrangler secret put RESEND_API_KEY         # resend.com (free: 3k emails/month) — verify your sending domain, set EMAIL_FROM in wrangler.toml
   npx wrangler secret put AZURE_TTS_KEY          # portal.azure.com → Create "Speech" resource (free tier: 500k chars/month)
   npx wrangler secret put AZURE_TTS_REGION       # e.g. eastus
   npx wrangler secret put DEEPGRAM_API_KEY       # console.deepgram.com ($200 free credit)
   npx wrangler secret put ADMIN_KEY
   # later, when selling: REVENUECAT_WEBHOOK_SECRET and/or STRIPE_WEBHOOK_SECRET
   ```
5. **Deploy**: `npm run deploy` → prints `https://senlin-api.<you>.workers.dev`
6. **Point the site at it**: set `apiBase` in `js/config.js` to that URL and push. `ALLOWED_ORIGINS` in `wrangler.toml` must list the site origin (`https://forrest-jones.github.io`) and, for the apps, `capacitor://localhost` and `https://localhost`.
7. Check: `curl https://senlin-api.<you>.workers.dev/v1/health` and sign in from Settings on the site.

Local development: copy `.dev.vars.example` to `.dev.vars`, `npm run db:migrate:local`, `npm run dev` (serves on :8787), set `apiBase: 'http://localhost:8787'` while testing (`DEV=1` allows the localhost site origin; `DEV_ECHO_CODE=1` prints the sign-in code in the response so no email is needed).

## What is live right now

- Worker: `https://senlin-api.forrestjones2010.workers.dev` (D1, KV, JWT signing all self-provisioned). `GET /v1/health` lists which provider keys are still missing.
- Stripe: product, the three prices, the webhook and the customer portal exist and their ids live in KV (created by the deploy workflow). The key currently stored is a **test-mode** key: purchases work with card `4242 4242 4242 4242`. To go live, replace the `STRIPE_SECRET_KEY` GitHub secret with the `sk_live_` key and rerun *Deploy API worker*; the setup repeats itself for live mode.
- Sign-in: email + password until `RESEND_API_KEY` is added (then email codes appear automatically).
- Talk through the server needs `ANTHROPIC_API_KEY`; until then the tutor uses the learner's own key or the claude.ai preview account.

## Providers and what they cost

| Piece | Provider | Free tier | Beyond |
| --- | --- | --- | --- |
| Hosting, DB, cache | Cloudflare Workers + D1 + KV | 100k requests/day, 5 GB D1 | $5/month Workers Paid |
| AI tutor | Anthropic API (`claude-sonnet-5` default) | – | ≈ $0.003–0.01 per tutor turn; a daily user on Pro ≈ $0.50–1/month |
| Sign-in emails | Resend | 3 000/month | $20/month for 50k |
| Cloud voice | Azure Speech (neural) or Google TTS (WaveNet) | Azure 500k chars/month, Google 1M chars/month | ≈ $16 per 1M chars |
| Speech-to-text | Deepgram Nova-2 (or OpenAI Whisper) | $200 credit | ≈ $0.0043/min (Whisper $0.006/min) |
| Billing | RevenueCat (apps) / Stripe (web) | RevenueCat free to $2.5k MTR | 1% / 2.9% + 30¢ |

Rough run-rate for **1 000 active learners**: Cloudflare $5, email $0–20, TTS ≈ $0 if the site ships pre-generated audio (`tools/audio.js`, one-off ≈ $1.50), STT ≈ $10–30, AI ≈ $150–400 depending on how many use Talk daily. Plan limits in `src/limits.js` cap the exposure per user.

## Plans and limits

`free`: 25 tutor messages/day, 60k output tokens/month, 20k TTS chars/month, 600 s STT/month.
`pro`: 400/day, 2M tokens, 500k chars, 20 000 s. Rate limit 20 tutor requests/minute for everyone. Change them in `src/limits.js`.

Set `PAYWALL = "1"` in `wrangler.toml` **and** `paywall: true` in `js/config.js` to gate HSK 3+ and the Deal Desk behind Pro; leave both off to sell nothing yet.

## Billing

Pricing (the rationale is in `PLAY_STORE.md` → Pricing): **$11.99 / month**, **$59.99 / year** marketed as "$5 a month" with a **7-day free trial**, and an optional **$149.99 lifetime** launch offer. HSK 1 is free forever. The catalogue lives in one place, `src/billing.js` → `PLANS`; the pricing page (`#/pro`) reads it from `GET /v1/billing/plans`.

### Web (Stripe), the two-step way

1. Cloudflare dashboard → Workers & Pages → **senlin-api** → Settings → Variables and Secrets. Add two **secrets**: `STRIPE_SECRET_KEY` (Stripe → Developers → API keys → Secret key, `sk_live_…`, or `sk_test_…` to rehearse) and `ADMIN_KEY` (any long random string). Deploy.
2. Open, in a browser, `https://<your worker>/v1/admin/stripe-setup?key=<ADMIN_KEY>`.

The worker then does everything below by itself and stores the ids in its KV: the "SenLin Pro" product, the three prices (matched by lookup key, so re-running never duplicates), the webhook endpoint pointing at this worker with the right three events and its signing secret, and a customer-portal configuration (cancel at period end, switch monthly/yearly, update card, invoices). The response lists what was created; `webhookSecretStored: true` means purchases will activate. Re-open the URL after switching from the test key to the live key; it repeats the setup for live mode.

### Web (Stripe Checkout + Customer Portal), by hand, about 20 minutes

1. Stripe dashboard → **Product catalogue** → add product "SenLin Pro" with three prices: recurring $11.99 monthly, recurring $59.99 yearly, one-time $149.99. Copy each `price_…` id.
2. `wrangler.toml` `[vars]`: set `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_PRICE_LIFETIME` (and `SITE_URL` if the site moves). Secrets: `STRIPE_SECRET_KEY` (Developers → API keys). Env values override whatever the one-URL setup stored.
3. **Webhook**: Developers → Webhooks → add endpoint `https://<worker>/v1/webhooks/stripe` with events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Put the signing secret in `STRIPE_WEBHOOK_SECRET`.
4. **Customer Portal**: Settings → Billing → Customer portal → enable, allow cancellation and plan switching between the two subscription prices. The site's "Manage subscription" button opens it.
5. The trial: the server adds `trial_period_days=7` to yearly checkouts, so no trial needs configuring on the price. Stripe emails the trial-ending reminder if you turn on *Settings → Subscriptions and emails → "Send emails about expiring trials"*.
6. Test with `sk_test_…` keys and card `4242 4242 4242 4242`: sign in on the site → `#/pro` → Start free trial → return to `#/pro/thanks`; `GET /v1/entitlement` shows `plan: "pro"`. Then switch to live keys.

Flow: `#/pro` → `POST /v1/billing/checkout {plan}` → Stripe-hosted page → back to `#/pro/thanks` → the `checkout.session.completed` webhook sets `plan = pro` and stores the Stripe customer id → later `customer.subscription.updated/deleted` events keep `plan` and `plan_expires_at` current (cancel at period end keeps access until it ends; past-due keeps access until the period end; deleted → free). Lifetime is a one-time payment with no expiry.

### Apps (RevenueCat, both stores)

- Google Play Console and App Store Connect: create subscriptions `pro_monthly` ($11.99) and `pro_yearly` ($59.99 with a 7-day free-trial introductory offer) and the non-consumable `pro_lifetime` ($149.99).
- RevenueCat: one project, both apps, entitlement **`pro`**, products attached, offering `default` with packages `$rc_monthly`, `$rc_annual`, `$rc_lifetime` (the client maps plan ids to these). Public SDK keys → `js/config.js` → `revenuecat.android` / `revenuecat.ios`.
- RevenueCat → Integrations → Webhooks: URL `https://<worker>/v1/webhooks/revenuecat`, Authorization header value = `REVENUECAT_WEBHOOK_SECRET`. The app signs users in first, so RevenueCat's `app_user_id` is our user id and the webhook lands on the right account.
- Store policy: the Android/iOS builds must not link to the web checkout; the pricing page detects the native shell and buys through RevenueCat instead.

### Turning the paywall on

`PAYWALL = "1"` in `wrangler.toml` and `paywall: true` in `js/config.js`. Until then Pro is sold only for the cloud allowances (tutor turns, voice, sync) and every lesson stays open, which is the right state while the catalogue is still being reviewed.

## Privacy

No IP addresses or user agents are stored. Events hold a name, a small props object, and either the user id or a random anonymous id. Tutor messages are forwarded to Anthropic and not stored on our side. Audio for speech-to-text is forwarded and not stored. Users delete everything with Settings → Reset plus an email to the owner (see `privacy.html`).
