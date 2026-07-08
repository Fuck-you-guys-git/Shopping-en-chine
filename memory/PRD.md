# Shopping en Chine — Paxity Payment Fix

## Original Problem Statement
Payments were failing with a **DNS error** because `backend/paxity_router.py` hardcoded `PAXITY_BASE_URL = "https://api.paxity.com/v1"` (a domain that does not resolve). Credentials never reached a server. The fix is spread across 4 phases: (1) make base URL fully env-driven, (2) harden error handling & status mapping, (3) enforce OTP for methods that require it, (4) configurable currency/prefix + retry with backoff.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB), all Paxity routes under `/api/paxity/*`
- **Frontend**: React 19 + Craco + Tailwind + shadcn/ui, checkout at `/commande`
- **Payment gateway**: Paxity (XOF mobile-money aggregator — OMSN, OMCI, WAVESN, WAVECI, MTNCI, MOOVCI, CARD)

## What's been implemented (Feb 2026)
### Phase 1 — Base URL is now env-driven
- `PAXITY_BASE_URL` reads from `.env` with NO hardcoded default host
- `PAXITY_HOST` extracted at runtime via `urlparse` from whatever URL is configured
- `/api/paxity/diagnostic` performs DNS lookup on the parsed host (no `"api.paxity.com"` literal anywhere)
- Config endpoint reports `base_url_set` boolean so frontend can warn

### Phase 2 — Error handling & status mapping
- `_map_status()` handles `success/completed/paid/successful/ok/done/confirmed` → success; `failed/error/cancelled/canceled/declined/rejected/expired/timeout/aborted/insufficient_funds` → failed; `pending/processing/awaiting_confirmation/awaiting_payment/in_progress/initiated/created/queued/sent/otp_sent` → pending
- `_extract_error_message()` digs through `message`, `error`, `error.message`, `errors[]`, `data.message`, `raw_text`, RFC 7807
- Full outbound-request + response logging on non-2xx (with PII redaction on phone/OTP)
- Transport failures return **424 Failed Dependency** instead of 502 so Cloudflare passes the JSON body through

### Phase 3 — OTP validation
- `PAYMENT_METHODS` dict has `requires_otp` per method (OMSN, OMCI = true; others = false)
- Backend validates: returns 400 with clear French message if method requires OTP and none provided
- Frontend: `Checkout.jsx` marks OTP field required (asterisk + placeholder + `required` attribute), pre-flight validation blocks submission, config endpoint exposes `requires_otp` per method

### Phase 4 — Config flexibility & resilience
- New env vars: `PAXITY_DEFAULT_CURRENCY` (default `XOF`), `PAXITY_DEFAULT_PREFIX` (default `221`), `PAXITY_MAX_RETRIES` (default `3`)
- `PaxityPayinRequest.currency` optional override per request
- `_post_with_retry()` — exponential backoff (0.5s × 2^attempt) for `TimeoutException` / `RequestError` / 5xx / 429; never retries 4xx to avoid double-charges
- Frontend `paxityDirect.js` respects same env-driven defaults

## Files touched
- `/app/backend/paxity_router.py` — full rewrite of the router (all 4 phases)
- `/app/backend/.env` — added `PAXITY_BASE_URL`, `PAXITY_API_KEY`, `PAXITY_API_TOKEN`, `PAXITY_ENV`, `PAXITY_DEFAULT_CURRENCY`, `PAXITY_DEFAULT_PREFIX`, `PAXITY_MAX_RETRIES`
- `/app/backend/requirements.txt` — added `httpx>=0.28.1`
- `/app/backend/server.py` — wires `paxity_router` under `/api`
- `/app/frontend/src/pages/Checkout.jsx` — OTP prompt/required flag driven by `requires_otp`, 424 treated as fallback trigger, currency propagation
- `/app/frontend/src/lib/paxityDirect.js` — env-driven BASE_URL/currency/prefix, expanded status map, availability check requires BASE_URL

## Testing
- 11/11 backend tests pass (`/app/backend/tests/test_paxity.py`)
- Frontend loads (verified via screenshot)
- Diagnostic returns correct DNS-failure message pointing at the real host from `.env`

## Next Action Items
- **User must set `PAXITY_BASE_URL`** in `/app/backend/.env` from their Paxity merchant dashboard (this is the actual blocker — the code is ready but needs the real host)
- User must also set `PAXITY_API_KEY` and `PAXITY_API_TOKEN` in `.env`
- After setting: `sudo supervisorctl restart backend` → open `/api/paxity/diagnostic` in a browser to verify `dns_ok=true` and `http_reachable=true`
- Optional: rename the GitHub repo (current name contains offensive language)
- Optional: register webhook URL in Paxity dashboard: `https://<domain>/api/paxity/webhook`

## Backlog (P2)
- Add per-method `min_amount` / `max_amount` if Paxity documents limits
- Gate diagnostic auth-test behind `?deep=1` to avoid creating fraud-flagged test transactions on live keys
- Redact secrets from `raw_response` before persisting to Mongo
- Strip non-digits (not just spaces) from phone before send + per-country length validation
