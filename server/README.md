# SenLin API — the backend

A single Cloudflare Worker (no runtime dependencies) that gives the static site accounts, cross-device sync with automatic backups, an AI-tutor proxy that keeps the Anthropic key on the server with per-user metering and rate limits, a licensed cloud voice (Azure or Google), cloud speech-to-text for iOS/Safari, privacy-respecting analytics, error reports, and the RevenueCat / Stripe webhooks that turn purchases into a `pro` plan.

Everything is optional. With `apiBase` empty in `js/config.js` the site runs exactly as before.

- `src/worker.js` routes → `auth.js`, `sync.js`, `ai.js`, `tts.js`, `stt.js`, `events.js`, `billing.js`, `limits.js`, `jwt.js`, `db.js`, `cors.js`, `sse.js`, `util.js`
- `schema.sql` D1 tables · `wrangler.toml` bindings and vars · `API.md` every endpoint with curl examples
- `test/` 23 node:test cases with in-memory D1/KV fakes: `npm test`

## Deploy from the Cloudflare Git integration (zero commands)

If the repository is connected in the Cloudflare dashboard (Workers & Pages → Create → Import a repository), every push to `main` deploys the worker. The root `wrangler.toml` points at `server/src/worker.js`, so the default build settings work: no build command, deploy command `npx wrangler deploy`. The D1 database and KV namespace are provisioned automatically on the first deploy (no ids in the config), and the worker creates its own tables on the first request, so there is no migration step.

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

## Billing wiring

- **Apps (Play / App Store)**: RevenueCat SDK in `js/native.js` uses our user id as `appUserID`. In RevenueCat → Integrations → Webhooks set the URL to `https://<worker>/v1/webhooks/revenuecat` and an Authorization header value; put the same value in `REVENUECAT_WEBHOOK_SECRET`. Entitlement identifier must be `pro`.
- **Web**: create a Stripe Payment Link (or Checkout) for the subscription, put it in `checkoutUrl` in `js/config.js` (the site appends `client_reference_id=<user id>`), and add a Stripe webhook for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → `https://<worker>/v1/webhooks/stripe`, secret in `STRIPE_WEBHOOK_SECRET`.

## Privacy

No IP addresses or user agents are stored. Events hold a name, a small props object, and either the user id or a random anonymous id. Tutor messages are forwarded to Anthropic and not stored on our side. Audio for speech-to-text is forwarded and not stored. Users delete everything with Settings → Reset plus an email to the owner (see `privacy.html`).
