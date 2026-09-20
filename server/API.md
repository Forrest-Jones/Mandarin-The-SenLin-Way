# SenLin API

Base URL: your worker, e.g. `https://senlin-api.<you>.workers.dev` (set as `apiBase` in `js/config.js`).
All bodies are JSON unless noted. Authenticated calls send `Authorization: Bearer <token>`.
Errors are `{ "error": "<code>", "message"?: "..." }`; limits are `429 { "error": "limit", "limit": "rate|daily|monthly", "resetAt": "<ISO>" }`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/v1/health` | – | `{ ok, version, providers: { ai, tts, stt, email } }` (booleans / names, never keys) |
| POST | `/v1/auth/request` | – | `{ email }` → sends a 6-digit code (10 min, 5/hour/email). With `DEV_ECHO_CODE=1` also returns `{ code }` |
| POST | `/v1/auth/verify` | – | `{ email, code }` → `{ token, user: { id, email, plan } }` (JWT, 90 days) |
| POST | `/v1/auth/password` | – | `{ email, password (≥8), create?: true }` → `{ token, user, created }`. Works without an email provider. `404 no_password` when the email has no password and `create` is not set; `401 bad_password`; 10 attempts/hour/email |
| GET | `/v1/me` | ✓ | `{ user, usage: { aiMessagesToday, aiTokensMonth, ttsCharsMonth, sttSecondsMonth }, limits }` |
| GET | `/v1/sync` | ✓ | `{ version, updatedAt, data }` or `404 { error: "none" }` |
| PUT | `/v1/sync` | ✓ | `{ version, data }` → `{ version, updatedAt }`; `409 { error: "conflict", version, updatedAt, data }` when the stored version moved on. Each write keeps the previous version as a backup (last 10). Max 2 MB. |
| GET | `/v1/sync/backups` | ✓ | `{ backups: [{ version, createdAt, bytes }] }` |
| GET | `/v1/sync/backups/:version` | ✓ | `{ version, createdAt, data }` |
| POST | `/v1/ai/chat` | ✓ | `{ system, messages: [{ role, content }], maxTokens?, stream?: true, model? }` → SSE (`data: {"text": "…"}` per delta, then `data: {"usage": {...}}`, then `data: [DONE]`); with `stream:false` → `{ text, usage }`. Limits: 20 req/min; free 25 msgs/day + 60k output tokens/month; pro 400/day + 2M/month |
| POST | `/v1/tts` | ✓ | `{ text (≤300), rate? 0.5–1.2, voice? }` → `audio/mpeg`. Cached 30 days by hash. Free 20k chars/month, pro 500k |
| POST | `/v1/stt?lang=zh` | ✓ | raw audio body (`audio/webm`, `audio/mp4`, `audio/wav`, ≤5 MB) → `{ text }`. Free 600 s/month, pro 20 000 s |
| GET | `/v1/billing/plans` | – | `{ plans: [{ id, name, price, currency, interval, trialDays, perMonth?, savePct?, highlight?, launchOffer?, rcPackage, sku, web }], web, portal, paywall }` — the catalogue (`monthly` $11.99, `yearly` $59.99 with a 7-day trial, `lifetime` $149.99); `web` per plan = purchasable through Stripe on this deployment |
| POST | `/v1/billing/checkout` | ✓ | `{ plan }` → `{ url, id, plan }`: a Stripe Checkout session (subscription mode with `trial_period_days` for yearly, payment mode for lifetime), `client_reference_id` = user id, returns to `SITE_URL#/pro/thanks` |
| POST | `/v1/billing/portal` | ✓ | → `{ url }` Stripe Customer Portal for the account's web subscription (404 `no_customer` when there is none) |
| GET | `/v1/push/vapid` | – | `{ publicKey }` — the VAPID application server key (generated once, kept in KV) |
| POST | `/v1/push/subscribe` | optional | `{ subscription: PushSubscription JSON, hour, minute, tz }` → `{ ok, hour, minute, tz }`; anonymous callers send `X-Senlin-Anon`. Upserts by endpoint |
| DELETE | `/v1/push/subscribe` | – | `{ endpoint }` → 204 |
| POST | `/v1/push/test` | – | `{ endpoint }` → sends one notification now → `{ ok, status }` |
| cron | every 15 min | – | sends "Your 10 minutes of Mandarin" to every subscription whose local time entered its chosen slot today; 404/410 endpoints are deleted |
| GET | `/v1/entitlement` | ✓ | `{ plan, expiresAt, features: { ai, hsk3plus, dealDesk } }` (`PAYWALL` unset → everything true) |
| POST | `/v1/events` | optional | `{ events: [{ name, props?, ts }] }` (≤50). Anonymous callers send `X-Senlin-Anon: <random id>`. Names whitelisted: lesson_start, lesson_done, review, talk_start, talk_end, write_quiz, tone_drill, install, purchase, error, visit, say, sign_in → 204 |
| POST | `/v1/errors` | optional | `{ message, stack?, url?, version? }` → 204 |
| POST | `/v1/webhooks/revenuecat` | `Authorization: <REVENUECAT_WEBHOOK_SECRET>` | RevenueCat events; `app_user_id` must be our user id |
| POST | `/v1/webhooks/stripe` | Stripe signature | `checkout.session.completed` (`client_reference_id` = user id) → pro; subscription updated/deleted → plan |
| GET/POST | `/v1/admin/stripe-setup` | `X-Admin-Key` or `?key=` | one-shot, idempotent Stripe setup: product, prices (lookup keys `pro_monthly`, `pro_yearly`, `pro_lifetime`), webhook for this worker, portal configuration; stores ids and the webhook secret in KV → `{ ok, mode, productId, prices, webhookId, webhookUrl, webhookSecretStored, portalConfig, created, next }` |
| GET | `/v1/admin/stats` | `X-Admin-Key` | users, new users (30 d), daily actives (7/30 d), lessons done, AI messages, errors (24 h) |

## Examples

```bash
API=https://senlin-api.example.workers.dev
curl -s $API/v1/health

curl -s -X POST $API/v1/auth/request -H 'content-type: application/json' -d '{"email":"you@example.com"}'
curl -s -X POST $API/v1/auth/verify  -H 'content-type: application/json' -d '{"email":"you@example.com","code":"123456"}'
# → {"token":"...","user":{...}}
T=<token>

curl -s $API/v1/me -H "authorization: Bearer $T"
curl -s -X PUT $API/v1/sync -H "authorization: Bearer $T" -H 'content-type: application/json' -d '{"version":0,"data":{"progress":{}}}'
curl -N -X POST $API/v1/ai/chat -H "authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"system":"Reply in Chinese.","messages":[{"role":"user","content":"你好"}]}'
curl -s -X POST $API/v1/tts -H "authorization: Bearer $T" -H 'content-type: application/json' -d '{"text":"你好，我是森林。","rate":0.85}' -o hello.mp3
curl -s -X POST "$API/v1/stt?lang=zh" -H "authorization: Bearer $T" -H 'content-type: audio/webm' --data-binary @clip.webm
curl -s $API/v1/admin/stats -H 'x-admin-key: <ADMIN_KEY>'
```

## Client contract

`js/cloud.js` implements this API: sign-in UI in Settings, debounced sync after every save (4 s), pull on load and when the tab regains focus, conflict merge (SRS by latest due date, completed days by union, counters by max), streaming tutor replies, cloud voice and cloud recogniser as fallbacks, opt-in events and error reports.
