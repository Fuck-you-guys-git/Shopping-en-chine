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


## Organisation de la mémoire (depuis Fév 2026)
- **PRD.md** (ce fichier) : problème d'origine, architecture, exigences stables.
- **CHANGELOG.md** : historique détaillé de toutes les implémentations/fixes datés.
- **ROADMAP.md** : backlog priorisé (P0/P1/P2) et prochaines tâches.

## État actuel (Fév 2026)
- App e-commerce complète et fonctionnelle : paiements Paxity (Wave/OM direct + carte via widget SaaS), multi-devises EUR/USD géré par Paxity, emails Resend automatisés, e-tickets imprimables, dashboard vendeur complet (stock, stats, journal emails, email de masse).
- RÈGLES CRITIQUES :
  - Ne jamais retirer le garde-fou `_safe_recipient` (email_service.py) qui bloque les emails de test vers commands@shoppingenchine.com.
  - Checkout.jsx utilise ?step=X pour le bouton retour navigateur — ne pas retirer.
  - CSS d'impression e-ticket (Orders.jsx) très spécifique — modifier avec extrême prudence.
  - Le user teste en PRODUCTION (shoppingenchine.com) → rappeler de REDÉPLOYER après chaque fix.
  - Toutes les réponses au user en FRANÇAIS.

## Refonte UI/UX (Juin 2026) — décisions figées par le user
- Identité : fond blanc / blanc cassé, texte noir profond, **rouge vermillon** comme unique couleur signature (usage parcimonieux : CTA, promos, éléments clés).
- Typographie : **100 % Inter** (la police serif Fraunces a été retirée ; la classe `.font-display` existe encore mais pointe sur Inter).
- Pas de comptes clients ni de favoris : les icônes correspondantes ont été retirées du header et de la fiche produit (interdiction d'afficher une fonctionnalité inexistante).
- Pas de sélecteur de langue manuel : la détection automatique par IP (LocaleContext) reste la seule source.
- RÈGLE ABSOLUE : ne JAMAIS inventer de données pour remplir l'interface (avis, notes, compteurs, stock, promos, dates de livraison, certifications). Si la donnée n'existe pas → masquer le composant ou afficher un état vide.
- Livraison par lots avec validation user entre chaque lot (voir ROADMAP.md).

## État Paxity v2 — Juin 2026
- Clé de test v2 supprimée du `.env` de la preview → v2 désactivée en preview, repli automatique sur la v1 (vérifié : `/api/paxity/v2/config` = `enabled:false`, `/api/paxity/v2/payin` = 503, repli v1 OK).
- Clé live `pax_live_…` **à déclarer par le user dans les secrets de PRODUCTION** (`PAXITY_V2_API_KEY`) : elle n'y est pas encore (vérifié auprès du deployer). Tant qu'elle est absente, la production encaisse via Paxity v1.
- P0 restant : le user ajoute le secret, re-publie, puis valide une vraie transaction XOF en production.
