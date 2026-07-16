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

## Update — Feb 2026 (real keys + response envelope fix)
- Added real `PAXITY_API_KEY` / `PAXITY_API_TOKEN` to `/app/backend/.env`; `configured=true`.
- **Bug fixed**: Paxity's real response nests fields inside a `data` object (`{"code":201,"data":{"status":"PENDING","transactionId","link","qrCode"}}`). Added `_payload_root()` to unwrap it; backend + `paxityDirect.js` now parse status/transactionId/link/qrCode from the nested object. Webhook also unwraps `data`.
- Added `country` (from method meta) + optional `ipn` (`PAXITY_IPN_URL`) fields to the payin payload per official docs.
- Pending screen now surfaces Paxity `payment_link` (button `paxity-payment-link-btn`) and `qr_code` (`paxity-qr-code`).
- Clearer French error for HTTP 401/403/404/429 in `_extract_error_message` (e.g. "Identifiants Paxity refusés (401)…").
- Fixed all React unescaped-entity lint errors in `Checkout.jsx`; updated stale `api.paxity.com` diagnostic copy to use `diagnostic.host`.
- Tests: `test_paxity_parsing.py` (11) + `test_paxity_integration.py` (7) = **18/18 pass**; frontend 3/3 flows pass (testing agent iteration_2).

## Update — Feb 2026 (badge Emergent supprimé)
- Badge « Made with Emergent » retiré de `frontend/public/index.html` (élément + script `emergent-main.js` qui le ré-injectait). Titre de l'onglet mis à jour : « Shopping en Chine ». Vérifié par capture d'écran.
- App déployée en production : https://paxity-payment-web.emergent.host — un **redéploiement** est nécessaire pour propager ce changement.

## Update — Feb 2026 (ajustements boutique)
- Délais de livraison partout mis à « Chine → Dakar en 15–20 jours » (Navbar, Accueil, Fiche produit, onglet Livraison, étape Livraison du checkout — options express/point relais supprimées, livraison standard unique Offerte).
- Avis supprimés : notes/étoiles retirées des cartes produit, de la fiche produit, section témoignages de l'accueil supprimée, tri « Meilleures notes » et filtre « Notes » retirés de la boutique.
- Animation à l'ajout au panier supprimée : le tiroir panier ne s'ouvre plus automatiquement (toast de confirmation conservé, ouverture manuelle via l'icône panier intacte).
- Validé par testing agent (iteration_3) : 100 % frontend, aucune régression (panier, checkout 3 étapes, tri prix OK).

## Update — Feb 2026 (suivi de commande « Où est mon colis ? »)
- Backend `tracking_router.py` : GET `/api/tracking/steps`, GET `/api/tracking/{order_id}` (accepte l'id sans préfixe `ord_`, ETA = créé +15/+20 jours), PUT `/api/tracking/{order_id}` (marchand, sans auth pour l'instant). Étapes : Commandé → Expédié de Chine → En douane → En livraison à Dakar → Livré.
- `paxity_router.py` : chaque commande créée initialise `tracking_step="ordered"` + `tracking_history`.
- Frontend : page `/suivi` (+ deep-link `/suivi/:orderId`) avec recherche, timeline 5 étapes, ETA en français, badge paiement, articles/total. Liens : Navbar « Suivi de colis », Footer « Suivi de commande », bouton « Suivre ma commande » sur l'écran de succès du checkout.
- Commande démo : `ord_demo12345678` (étape « En douane »).
- Tests : `tests/test_tracking.py` (7) — 18/18 pytest ; testing agent iteration_4 : 100 % backend + frontend.

## Update — Feb 2026 (✅ PAXITY DÉBLOQUÉ — paiement fonctionnel de bout en bout)
- **Vrai endpoint découvert** en inspectant le bundle JS de paxity.io : le PayIn n'est PAS `api.paxity.io/v1/payments/payin/` (qui renvoyait 401) mais **`https://transaction.paxity.io/api/v1/transaction/pay-in-mobile`** avec en-têtes `x-api-key` + `x-api-token`.
- `PAXITY_BASE_URL` = `https://transaction.paxity.io/api/v1` ; nouvelles clés du compte « SHOPPING EN CHINE » dans `.env`.
- Diagnostic refait pour utiliser le GET `/paxity/balance` (lecture seule) au lieu de créer une transaction test.
- **Vérifié via curl** : diagnostic 200 (balance), payin WAVESN 201 → statut PENDING + vrai lien `pay.wave.com` + QR code ; OMSN sans OTP → 400 ; OMSN avec OTP → PENDING.
- Frontend `paxityDirect.js` mis à jour (host + endpoint).

## Update — Feb 2026 (UX erreurs de paiement côté client)
- Panneau technique « Diagnostic de la connexion Paxity » supprimé de la page paiement (état, composant DiagnosticRow, auto-affichage). Les détails techniques vont dans console.error uniquement.
- Erreurs non-400 → message générique convivial ; erreurs 400 (OTP requis, montant invalide…) → message actionnable conservé ; erreur réseau → « Impossible de contacter le serveur… ».
- Bannière « Configuration Paxity requise » (mentionnait PAXITY_API_KEY/backend/.env) reformulée en « Paiement momentanément indisponible ».
- Bannière d'erreur : data-testid="paxity-error-banner". Validé testing agent iteration_7 : 5/5 (interceptions 401/500/réseau, zéro fuite technique).

## Update — Feb 2026 (deep search « paiement ne marche pas » + garde auto-réparatrice)
- Deep search confirmé : production shopenchine.com utilise encore `api.paxity.io/v1` (401) ; l'aperçu utilise `transaction.paxity.io/api/v1` (200). Cause = déploiement/config de prod obsolète.
- Découverte : les ANCIENNES clés sont aussi valides sur le bon host, mais pointent vers le business « MIRACLE ORGANICS » (les nouvelles → « SHOPPING EN CHINE »). Le seul vrai problème a toujours été l'URL.
- **Garde auto-réparatrice** ajoutée dans `paxity_router.py` : si `PAXITY_BASE_URL` contient `api.paxity.com` ou `api.paxity.io` (hôtes morts), le code force `https://transaction.paxity.io/api/v1` au démarrage (avec warning loggué). Le prochain redéploiement corrige donc la prod même si la variable d'env de prod est obsolète.
- Validé testing agent iteration_8 : 100 % (garde testée sur 4 scénarios, diagnostic 200, validations 400, 18/18 pytest).

## Update — Feb 2026 (bug « carte 400 » — carte retirée, OTP optionnel)
- Cause : le compte Paxity ne supporte QUE le Mobile Money (23 méthodes, aucune carte). CARD → 403 ERR_FORBIDDEN chez Paxity. MOOVCI non supporté non plus.
- Fix : CARD et MOOVCI retirés de PAYMENT_METHODS (5 méthodes restantes : OMSN, OMCI, WAVESN, WAVECI, MTNCI). OMSN/OMCI sont des flux CODE_QR → `requires_otp=False` partout (vérifié : payin OMSN sans OTP → 201 + lien orange-sonatel + QR). Champ OTP frontend désormais « (facultatif) », formulaire carte mort supprimé, footer mis à jour (plus de « Carte, PayPal »).
- Tests : fichiers obsolètes/dangereux supprimés (test_paxity.py, test_paxity_integration.py) ; suites mises à jour ; nouveau test_paxity_card_removal.py (agent). Validé iteration_9 : 100 % (30/30 backend + frontend complet).
- Endpoint utile découvert : GET /payment-method (liste live des méthodes, commissions, logos, instructions) — piste future pour config dynamique.

## Update — Feb 2026 (catalogue)
- 2 produits à 2 000 F CFA ajoutés dans `frontend/src/data/products.js` : p9 « Écouteurs filaires métal » (tech) et p10 « Paire de chaussettes coton » (mode), badge « Petit prix ». Images vérifiées par capture. Boutique : 10 produits.

## Update — Feb 2026 (5 ajustements UX + confirmation de paiement live)
- « Retours 30 jours » supprimé partout (Accueil, fiche produit, footer). Bénéfices accueil : 3 items.
- Bouton « Ajouter au panier » toujours visible sous chaque carte produit (data-testid product-card-add-btn), overlay au survol supprimé.
- Menu mobile restructuré : Accueil/Boutique en haut, 6 catégories en 2 colonnes (mobile-menu-categories), bouton « Suivi de commande » épinglé en bas (mobile-menu-tracking-link).
- Page /commande : récapitulatif (articles + prix) en HAUT sur mobile, formulaire en bas (classes order-1/order-2 ; desktop inchangé).
- Confirmation : `check_status` backend interroge Paxity EN LIVE tant que pending (GET /transaction/pay-in-mobile/{ref}) et met à jour Mongo — le client revenant de Wave voit « Votre commande est confirmée 🎉 » (order-confirmed-title) sans webhook. Bug « 0 F » corrigé (merge complet de la réponse de statut).
- Validé : iteration_10 (tout sauf montant) + iteration_11 (montant corrigé, 100 %). Pytest backend 23/23.

## CURRENT BLOCKER (external, not a code bug)
- Paxity's live API `api.paxity.io` returns **HTTP 401 (empty body)** for the supplied merchant keys — verified via curl, diagnostic (`auth_test_status=401`), and the testing agent. DNS + HTTP reachability are OK.
- **Resolution is on the user's side**: verify/regenerate `ApiKey`+`ApiToken` in the Paxity dashboard, confirm the merchant account is activated for production, and check whether Paxity requires **IP whitelisting** (preview outbound IP was `104.198.214.223`, changes in prod).

## Next Action Items
- User: provide valid/activated Paxity keys (and/or whitelist server IP) → then the full payin will complete and return the Orange Money `link`/`qrCode`.
- Register webhook URL in Paxity dashboard: `https://<domain>/api/paxity/webhook`; optionally set `PAXITY_IPN_URL` in `.env` so it's sent on each payin.


## Backlog (P2)
- Add per-method `min_amount` / `max_amount` if Paxity documents limits
- Gate diagnostic auth-test behind `?deep=1` to avoid creating fraud-flagged test transactions on live keys
- Redact secrets from `raw_response` before persisting to Mongo
- Strip non-digits (not just spaces) from phone before send + per-country length validation
