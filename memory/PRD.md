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

## Update — Feb 2026 (emails de confirmation Resend)
- Intégration Resend : email au marchand à chaque commande payée (id, tableau articles, total, infos client). `email_service.py` (asyncio.to_thread, flag atomique `confirmation_email_sent` = exactly-once). Hooks : payin succès immédiat, webhook, refresh live du statut.
- `.env` : RESEND_API_KEY, SENDER_EMAIL=onboarding@resend.dev, MERCHANT_EMAIL=bafatoumata414@gmail.com (mode test Resend = seul destinataire autorisé ; pour un autre destinataire ou emails clients → vérifier le domaine shopenchine.com dans Resend).
- Validé iteration_12 : 100 % (webhook → 1 email réel envoyé, idempotence OK, régression 23/23). Test file: tests/test_email_webhook.py (⚠️ le relancer envoie un vrai email).

## Update — Feb 2026 (menu mobile en liste verticale)
- Section « Catégories » (grille 2 colonnes) supprimée du menu mobile. Liste verticale unique (mobile-menu-list) : Accueil, Boutique, puis les 6 catégories une par ligne (avec icône), « Suivi de commande » épinglé en bas. data-testid mobile-menu-trigger ajouté au hamburger. Validé iteration_13 : 100 %.

## Update — Feb 2026 (menu : navigation directe + alignement + icônes)
- Tiroir mobile contrôlé (menuOpen) : chaque lien ferme le menu au clic → navigation directe vers la page. Lignes décalées vers la gauche (pl-2 pr-3). « Électrique » remplace « Tech & Gadgets » (icône fa-plug), bannière accueil mise à jour.
- **Fix global** : la CSS FontAwesome n'était jamais chargée (toutes les icônes fa-* invisibles) → CDN FA 6.5.2 ajouté dans index.html. SheetTitle sr-only ajouté (a11y).
- Validé iterations 14-15 : 100 %.

## Update — Feb 2026 (Espace vendeur : boutons + photo téléphone)
- Dashboard vendeur : barre d'actions bien visible (Ajouter un produit / Commandes / Mes produits), « Voir tout » en bouton contour.
- Ajout produit : bouton « Ajouter une photo depuis votre téléphone » (input file accept=image/*, redimensionnement canvas 900px JPEG q0.82, stocké en data URL) + aperçu live.
- `getAllProducts()` (data/products.js) fusionne les produits vendeur (localStorage sec_seller_products_v1) avec le catalogue statique → visibles sur /boutique, /produit/:id, panier.
- ⚠️ LIMITE CONNUE : produits vendeur stockés en localStorage = visibles UNIQUEMENT sur l'appareil du vendeur, PAS pour les clients. Migration backend (MongoDB) nécessaire pour visibilité globale — proposé comme prochaine étape P0.
- Validé iterations 16-17 : 100 %.

## CURRENT BLOCKER (external, not a code bug)
- Paxity's live API `api.paxity.io` returns **HTTP 401 (empty body)** for the supplied merchant keys — verified via curl, diagnostic (`auth_test_status=401`), and the testing agent. DNS + HTTP reachability are OK.
- **Resolution is on the user's side**: verify/regenerate `ApiKey`+`ApiToken` in the Paxity dashboard, confirm the merchant account is activated for production, and check whether Paxity requires **IP whitelisting** (preview outbound IP was `104.198.214.223`, changes in prod).

## Update — Feb 2026 (✅ Migration MongoDB auth vendeur + catalogue — VÉRIFIÉE E2E)
- Auth vendeur : JWT backend (`auth_router.py`, bearer + cookie httpOnly, lockout 5 essais/15min). Produits : CRUD MongoDB (`products_router.py`, seed + tombstones anti-résurrection).
- **Catalogue public branché sur la DB** : `CatalogProvider` monté dans `App.js` ; `Home.jsx`, `Products.jsx`, `ProductDetail.jsx` utilisent `useCatalog()` (fini `getAllProducts()` statique). `SellerContext` rafraîchit le catalogue après add/update/delete → un produit ajouté du Dashboard est visible immédiatement sur la boutique publique pour TOUS les clients.
- **Fix menu Dashboard invisible (mobile)** : les couleurs `ink`/`success` manquaient dans `tailwind.config.js` (fond du menu transparent). Ajoutées + tous les boutons du menu en ROUGE (bg-red-600, texte blanc), data-testid seller-nav-*, seller-logout-btn.
- Fix cosmétique : minHeight sur les ResponsiveContainer Recharts (Dashboard.jsx) pour supprimer les warnings width=-1.
- Validé iteration_18 : 100 % (backend 9/9 pytest `tests/test_auth_products.py` ; E2E : login → ajout produit → visible sur /boutique + /produit/:id + panier → suppression ; menu mobile rouge vérifié ; redirection route protégée OK).
- Reste à nettoyer (P2) : `data/products.js` sert encore de seed/fallback + source des `categories` — suppression complète possible une fois les catégories migrées.

## Update — Feb 2026 (✅ Simulation stoppée + commandes réelles + bulk + textes)
- **Simulation supprimée** : plus de commandes fictives (Kwame Mensah, #SEC-xxxxx), plus de ticker 6s, plus de localStorage `sec_seller_orders_v1`, plus de badges de tendance fictifs (+12.4%...). `SellerContext.jsx` réécrit : commandes réelles depuis `GET /api/orders` (db.orders, poll 30s), métriques calculées sur les commandes PAYÉES uniquement, flux « Activité en direct » = dernières vraies commandes.
- **Nouveau backend `orders_router.py`** : `GET /api/orders` (auth vendeur) + `PUT /api/orders/bulk-tracking` (changement d'étape en masse, $push historique).
- **Bulk UI** (`Orders.jsx` réécrit) : cases à cocher par ligne + tout sélectionner, barre d'action (orders-bulk-bar) avec sélecteur de statut + Appliquer. Statuts = étapes de suivi réelles (Commandé/Expédié de Chine/En douane/En livraison/Livré) partagées avec /suivi. Badges paiement (Payée/En attente/Échoué).
- « Électrique » → « Électronique » (menu, accueil, catégories). Livraison « 10–20 jours » partout (Navbar, Footer, Accueil, fiche produit, checkout) + ETA tracking = +10/+20 jours (`tracking_router.py`).
- Validé iteration_19 : 100 % backend (6/6 pytest `tests/test_orders_bulk.py`) + 100 % frontend E2E (bulk persistant après refresh, aucune commande fictive après 15s, textes vérifiés).

## Update — Feb 2026 (sous-catégories Mode dans le menu)
- 7 sous-catégories sous « Mode » : Vêtements, Chaussures, Sacs, Lunettes, Accessoires, Bijoux, Montres (`modeSubcategories` dans data/products.js avec mots-clés de repli).
- Desktop : dropdown au survol de « Mode » (desktop-mode-sub-*). Mobile : sous-liste indentée sous Mode (mobile-mode-sub-*). Boutique : pastilles de sous-catégories sur /boutique/mode + filtre `?sub=` (par champ `subcategory` du produit OU mots-clés dans le nom). H1 = nom de la sous-catégorie.
- Formulaire vendeur AddProduct : sélecteur « Sous-catégorie Mode » (optionnel) quand catégorie = Mode ; backend `ProductPayload.subcategory` ajouté.
- Vérifié par captures desktop + mobile et curl (création produit avec subcategory OK).

## Update — Feb 2026 (sous-catégories Électronique + système généralisé)
- 9 sous-catégories sous « Électronique » : Smartphones, Tablettes, Ordinateurs, Caméras, Montres connectées, Écouteurs & Casques, Chargeurs & Câbles, Éclairage LED, Jeux & Gaming (`techSubcategories`).
- Système généralisé via `subcategoriesByCategory` (data/products.js) : dropdown desktop (desktop-submenu-{cat}, desktop-sub-{id}), sous-liste mobile (mobile-submenu-{cat}, mobile-sub-{id}), pastilles boutique (subcategory-pills, sub-pill-{id}), sélecteur AddProduct pour toute catégorie ayant des sous-catégories.
- Vérifié par capture : 9 items tech + 7 items mode, filtre ?sub=ecouteurs-casques → 2 produits.

## Update — Feb 2026 (sous-catégories Maison)
- 11 sous-catégories sous « Maison » : Chambre à coucher, Salon, Cuisine, Salle de bain, Décoration, Meubles, Tapis, Rideaux, Éclairage, Rangement & Organisation, Jardin & Extérieur (`maisonSubcategories`, ids uniques cuisine-maison / eclairage-maison pour éviter collision avec catégories existantes). Vérifié par capture (11 items dropdown + 12 pastilles).

## Update — Feb 2026 (sous-catégories Beauté)
- 4 sous-catégories sous « Beauté » : Soins, Maquillage, Parfums, Appareils de beauté (`beauteSubcategories`). « Beauté » ajouté au menu desktop (avec dropdown) — il n'y figurait pas avant. Mobile automatique. Vérifié par capture (4 items desktop + 4 mobile, page Parfums OK).

## Update — Feb 2026 (sous-catégories Enfants)
- 6 sous-catégories sous « Enfants » : Vêtements pour filles, Vêtements pour garçons, Chaussures, Jouets, Accessoires, Fournitures scolaires (`enfantsSubcategories`). « Enfants » ajouté au menu desktop avec dropdown. Vérifié par capture (6 items, page Jouets OK).

## Update — Feb 2026 (menu épuré — sous-catégories sur les pages uniquement)
- À la demande de l'utilisateur : dropdowns desktop et sous-listes mobiles SUPPRIMÉS du menu. Chaque section (Mode, Électronique, Maison, Beauté, Enfants) est un lien direct vers sa page /boutique/{cat}, où les pastilles de sous-catégories (subcategory-pills) restent affichées pour filtrer. Beauté et Enfants conservés dans le menu desktop. AddProduct + filtre ?sub= inchangés. Vérifié par capture desktop + mobile (0 dropdown, pastilles OK).

## Update — Feb 2026 (✅ GROS LOT « Make it all » — 8 améliorations, iteration 20 + E2E carte réel)
1. **Stripe carte bancaire** (en plus de Paxity) : sandbox Emergent (clés dans backend/.env : STRIPE_SECRET_KEY etc.), `stripe_router.py` — POST /api/payments/stripe/checkout (montants XOF calculés côté serveur depuis db.products, zero-decimal), GET /api/payments/stripe/status/{sid}, webhook /api/stripe/webhook, `_mark_paid` idempotent. Checkout: tuile « Carte bancaire » (stripe-card-method-btn) + pages /payment/success (poll) et /payment/cancel. **E2E réel validé avec carte 4242 : paiement → confirmation → emails → DB success** (données test nettoyées).
2. **Relance paniers abandonnés** : `_recovery_loop` dans server.py (30 min, claim atomique recovery_email_sent) → email avec lien /reprise/{order_id} ; page RetryOrder.jsx restaure le panier et redirige vers /commande.
3. **Email de confirmation au CLIENT** (`maybe_send_customer_confirmation`) après paiement Paxity ET Stripe. ⚠️ Resend en MODE TEST: seul bafatoumata414@gmail.com reçoit — vérifier le domaine sur resend.com/domains pour toucher les clients.
4. **Notifications de suivi** : email au client à chaque changement de statut (individuel + bulk), fire-and-forget.
5. **WhatsApp flottant** : `WhatsAppButton.jsx` + `config.js` (WHATSAPP_NUMBER vide → bouton masqué — EN ATTENTE du numéro de l'utilisateur).
6. **Page À propos** /a-propos + lien footer.
7. **SEO** : meta/OG dans index.html + hook usePageTitle (titres par page: accueil, boutique, catégories/sous-catégories, produit, à propos).
8. **Vraies tendances Dashboard** : trendRevenue/trendOrders/trendBasket = 30j courants vs 30j précédents (null si pas d'historique).
- FRONTEND_URL (backend/.env) sert aux liens des emails — pointe sur la preview; à passer au domaine prod au déploiement.
- Testé iteration_20 : 100 % backend (11/11) + 100 % frontend (15/15) + paiement carte E2E réel par l'agent principal.

## Update — Feb 2026 (5 photos par produit)
- AddProduct : jusqu'à 5 photos par produit — upload multiple depuis téléphone (compressé 800px/q0.75 côté client), exemples cliquables (toggle), ajout par URL. Grille des photos avec suppression (remove-photo-{i}), badge « Principale » et bouton étoile « définir comme principale » (make-main-photo-{i}). Compteur (n/5). payload: image = photos[0], images = [...].
- Backend `ProductPayload.images: Optional[list[str]]`.
- Fiche produit publique : VRAIE galerie (avant : miniatures d'autres produits !) — product.images avec image principale interchangeable (product-thumb-{i}, product-main-image), miniatures masquées si 1 seule image, reset au changement de produit.
- Testé : curl (3 images persistées), Playwright mobile (upload 3 fichiers, suppression, photo principale), galerie publique (clic miniature change l'image). Produit test supprimé.

## Update — Feb 2026 (placeholder description masqué)
- « Description à compléter. » n'est plus enregistré ni affiché côté client (AddProduct envoie "" ; ProductDetail masque la ligne si vide/placeholder, texte générique conservé dans l'onglet Description).
- Bug signalé par l'utilisateur (galerie prod avec photos d'autres produits) = déjà corrigé en preview, EN ATTENTE DE REDÉPLOIEMENT.
- LIMITE CONNUE : pas de fonction « Modifier un produit » dans le dashboard (seulement supprimer) — proposé à l'utilisateur comme prochaine feature.

## Update — Feb 2026 (édition produit + UI fiche produit + couleurs)
1. **Page « Modifier un produit »** : route /vendeur/modifier/:editId (+ /admin) réutilisant AddProduct en mode édition (pré-rempli : nom, catégorie, sous-catégorie, prix, description, badge, couleurs, 5 photos). PIÈGE RÉSOLU : les Selects Radix montés avant le prefill réinitialisaient leur valeur → le formulaire ne rend qu'après chargement (state `ready`). Dashboard produits : crayon → page d'édition (edit-product-{id}), œil → fiche publique (view-product-{id}).
2. **Bouton « Ajouter au panier » agrandi** (h-14, texte base). BUG RACINE : `flex-1` dans un parent `flex-col` (mobile) transformait la hauteur en flex-basis 0 → bouton 24px ; corrigé avec `sm:flex-1` (flex-1 seulement en ligne desktop).
3. **Tailles S/M/L/XL masquées** hors catégories mode/enfants (plus de tailles sur l'électronique).
4. **Palette de 21 couleurs nommées** (`/src/lib/colors.js` COLOR_PALETTE + colorName) dans AddProduct (swatches avec noms) ; fiche produit affiche « Couleur : Rouge » (nom réel).
- Testé Playwright : édition p1 pré-remplie (Électronique/Nouveauté) → sauvegarde OK ; tech sans tailles ; mode avec tailles + couleur nommée ; bouton 56px mobile+desktop. Produit test E2E résiduel supprimé.
- NOTE : hot reload frontend parfois obsolète — restart frontend si un changement ne semble pas appliqué.

## Update — Feb 2026 (polish typographie + fluidité + régression complète)
- Fiche produit : titre réduit (text-2xl→4xl responsive) et prix (text-2xl/3xl) — demande utilisateur « font too big ».
- Fluidité : transition douce entre pages (main.page-fade, fondu + translation 0.35s, key=pathname).
- RÉGRESSION COMPLÈTE iteration_21 : 42/42 PASS (parcours client mobile+desktop, Stripe, suivi, reprise panier, parcours vendeur complet avec édition/ajout/suppression produit, bulk commandes, responsive 390px, aucune erreur console). Aucun bug produit. L'agent de test a corrigé une assertion pytest obsolète (ETA 15→10j) et nettoyé un ordre Stripe test résiduel.
- Amélioration future notée : pagination /api/orders (48 commandes en un payload, OK à cette échelle).

## Update — Feb 2026 (réduction supplémentaire des polices)
- 2e demande utilisateur « police bcp plus grand » : fiche produit titre text-xl/2xl/3xl + prix text-xl/2xl ; H1 boutique & à-propos text-2xl/3xl/4xl (avant 4xl/5xl/6xl) ; hero accueil text-2xl/3xl/4xl ; « Vous aimerez aussi » text-2xl/3xl. Vérifié par capture mobile.

## Update — Feb 2026 (livraison offerte retirée + recherche intelligente)
- « Livraison offerte » supprimée PARTOUT : bandeau navbar, fiche produit, checkout (étape livraison), panier/drawer/récap — la ligne Livraison affiche désormais « Chine → Dakar / 10–20 jours » sans prix ; shipping = 0 (inclus). Si l'utilisateur veut des frais de livraison payants, changer `const shipping = 0` dans Cart.jsx, Checkout.jsx, CartDrawer.jsx.
- **Recherche intelligente** (`/src/lib/search.js` productMatchesQuery) : matche nom + description + catégorie + sous-catégories via leurs mots-clés (normalisation accents). Ex vérifié : « montre » → Chronographe Nord, « ecouteur » → Casque Aura Pro. Utilisée dans Products.jsx (barre de recherche → /boutique?q=).

## Update — Feb 2026 (tailles retirées des non-vêtements)
- Tailles S–XL masquées pour : lunettes, sacs, bijoux, montres, accessoires, jouets, fournitures scolaires (détection par subcategory OU mots-clés dans le nom — helper hasSizes dans ProductDetail.jsx). Conservées pour vêtements/chaussures (mode + enfants). Vérifié : p6 lunettes sans tailles, p4 sneakers et p8 pull avec tailles.

## Update — Feb 2026 (mots-clés de recherche vendeur + fix filtre prix)
- Champ « Mots-clés de recherche » dans AddProduct (product-keywords-input, virgules → liste), pré-rempli en édition ; backend `ProductPayload.keywords` ; la recherche (`lib/search.js`) matche ces mots-clés. Vérifié : MacBook test trouvé via « ordinateur » et « pc portable ».
- BUG CORRIGÉ : le filtre prix plafonnait à 200 000 F → les produits plus chers n'apparaissaient JAMAIS dans la boutique. Désormais curseur au max = « 200 000 F et + » (pas de limite haute).

## Next Action Items
- **Stripe (demandé par l'utilisateur)** : en attente de ses choix (s'ajouter à Paxity ou remplacer ; devise ; email de confirmation). Clé de test dispo dans l'environnement — ne jamais demander de clé.
- Redéploiement production (shopenchine.com) pour propager : menu rouge Dashboard + catalogue DB.
- User: provide valid/activated Paxity keys (and/or whitelist server IP) → then the full payin will complete and return the Orange Money `link`/`qrCode`.
- Register webhook URL in Paxity dashboard: `https://<domain>/api/paxity/webhook`; optionally set `PAXITY_IPN_URL` in `.env` so it's sent on each payin.


## Backlog (P2)
- Add per-method `min_amount` / `max_amount` if Paxity documents limits
- Gate diagnostic auth-test behind `?deep=1` to avoid creating fraud-flagged test transactions on live keys
- Redact secrets from `raw_response` before persisting to Mongo
- Strip non-digits (not just spaces) from phone before send + per-country length validation

## Update — Feb 2026 (fix « Enregistrement impossible » à l'ajout de produit)
- CAUSE RACINE : le token JWT vendeur expire après 12h ; l'UI gardait l'utilisateur « connecté » (localStorage) et le POST /api/products renvoyait 401 → toast générique « Enregistrement impossible » sans explication. Vérifié : payloads jusqu'à 7 Mo passent sur preview ET production (pas de limite 413), petit produit OK → seule l'expiration de session reproduisait l'erreur.
- FIX 1 (api.js) : intercepteur → sur 401 (hors /auth/login) avec token présent, événement `seller-session-expired`.
- FIX 2 (SellerAuthContext.jsx) : écoute l'événement → purge token/user + toast « Session expirée — Veuillez vous reconnecter » + redirection auto vers /vendeur/login (via ProtectedSellerRoute).
- FIX 3 (AddProduct.jsx) : messages d'erreur précis (422 = infos invalides, 413 = photos trop lourdes, timeout = connexion lente, sinon détail serveur) au lieu du message générique.
- FIX 4 (bug annexe) : les mots-clés de recherche saisis n'étaient JAMAIS envoyés au backend (champ oublié dans submit) → désormais `keywords` inclus (vérifié en DB).
- FIX 5 : timeout axios 90s pour create/update produit (photos base64 sur mobile lent).
- Testé E2E (Playwright) : login → ajout produit avec photo + mots-clés → OK ; session expirée → toast + redirect login → OK. Produits de test supprimés, DB à 0 produit.
- NOTE : si le bug était constaté sur shoppingenchine.com (production), un REDÉPLOIEMENT est nécessaire pour propager le correctif.

## Update — Feb 2026 (tailles produits + performance + swipe photos)
- « Garantie 2 ans » supprimée (badges fiche produit → « Paiement sécurisé », ligne Caractéristiques retirée).
- **Tailles facultatives vendeur** (AddProduct, carte Variantes) : lettres XS→4XL + numériques 1→55 (data-testid seller-size-X). Backend ProductPayload.sizes. Fiche produit affiche les tailles du vendeur (sinon fallback S–XL vêtements). Taille choisie par le client → panier (lignes séparées par taille via CartContext lineKey id::taille), affichée dans drawer + /panier, transmise au checkout : Paxity items[].name « — Taille X », Stripe StripeItem.size → nom de ligne. Édition produit pré-remplie via GET /api/products/{id}.
- **Performance chargement produits** : GET /api/products allégé (projection sans 'images' — galeries base64 exclues), nouvel endpoint GET /api/products/{id} (fiche complète, utilisé par ProductDetail et l'édition vendeur), GZipMiddleware (min 1024o), galerie non stockée dans le panier localStorage.
- **Swipe photos** : glisser le doigt sur la photo principale change d'image (onTouchStart/onTouchEnd, seuil 45px, wrap), points indicateurs (product-gallery-dots), animation img-swap (index.css).
- Tests : backend 5/5 PASS (test_iter22_sizes_gzip.py — liste allégée, gzip, round-trip sizes, 404, Stripe taille dans l'ordre). UI auto-vérifiée par le main agent (tailles fiche, panier ligne p_xxx::40, toast Taille 40). Pass Playwright complet SKIPPÉ à la demande de l'utilisateur (« without test »). Rapport /app/test_reports/iteration_22.json.
- Base nettoyée : 0 produit, commandes/QA de test supprimées.

## Update — Feb 2026 (confirmation Paxity + vitesse catalogue x100)
- **BUG confirmation Paxity corrigé** : quand le client partait payer dans l'app Wave/OM, le navigateur mobile rechargeait la page au retour → état React perdu → jamais de page de confirmation. FIX (Checkout.jsx) : transaction pending persistée dans localStorage (sec_pending_paxity_tx_v1), restaurée au montage ; polling avec check immédiat + listener visibilitychange/focus (check dès le retour sur l'onglet) ; bouton « J'ai payé — Vérifier » (paxity-manual-check-btn) ; lien « Annuler et choisir un autre moyen » ; operator_label persisté. Vérifié E2E : restauration après reload → pending screen → statut success en DB → page « Votre commande est confirmée 🎉 » + localStorage nettoyé.
- **PERFORMANCE catalogue (prod : 92 produits = 11 Mo → ~100 Ko)** : les photos base64 ne sont plus dans les documents produits. Nouveau stockage db.product_images {product_id, image_id, data(Binary), thumb(Binary 480px q70), content_type, v(md5)8}. Endpoints GET /api/products/{id}/img/{image_id} (pleine taille) et /thumb/{image_id} (miniature), Cache-Control immutable (le proxy preview l'écrase, la prod peut le respecter). Les docs produits contiennent des URLs relatives (/api/...) — fonctionnent car frontend et API partagent le domaine. doc.image = thumb de la 1re photo (cartes), doc.images = URLs pleine taille (galerie fiche). Création/édition : _process_images convertit les data-URI, garde les URLs existantes, purge les orphelines ; DELETE produit purge product_images.
- **MIGRATION AUTO au démarrage** (migrate_base64_images, tâche de fond dans server.py startup) : convertit tous les produits existants encore en base64 → au premier redéploiement en production, les 92 produits seront convertis automatiquement. Testé : produit base64 inséré en DB → restart → converti en URLs.
- Frontend : thumbOf() dans ProductDetail (vignettes en miniature), pillow==12.3.0 ajouté à requirements.txt.
- Tests self-service complets (création produit → URLs, liste 380 octets, img/thumb servis, migration, boutique + fiche affichent les images, flux confirmation restauré). DB nettoyée : 0 produit.
- RAPPEL UTILISATEUR : REDÉPLOYER pour activer en production (la migration des 92 produits se fera toute seule au démarrage).

## Update — Feb 2026 (récap commande complet + tickets colis imprimables)
- **Téléphone + adresse dans les commandes** : PaxityCustomer et StripeCustomer acceptent phone/address ; Checkout envoie `+{prefix} {phone}` et `adresse, zip` pour les deux moyens de paiement.
- **Page de confirmation enrichie** : nouveau composant OrderSummary.jsx (fetch GET /api/paxity/orders/{id}) — articles avec tailles/qté/prix, total payé, bloc Livraison (nom, tél, adresse+ville, email). Intégré aux confirmations Paxity (Checkout) ET Stripe (PaymentSuccess).
- **Email client enrichi** : section « Adresse de livraison » (nom, tél, adresse, ville) dans l'email de confirmation Resend. L'email marchand affichait déjà tél/adresse (désormais renseignés).
- **Dashboard** : mapOrder expose phone/address ; le dialog commande affiche adresse complète + téléphone.
- **Tickets colis imprimables (Orders.jsx)** : bouton « Imprimer les tickets (N) » dans la barre de sélection multiple + « Imprimer le ticket » dans le détail d'une commande. Génère une fenêtre imprimable (window.open + print) : un ticket par commande (marque, n° commande, client, tél, adresse, articles × qté avec tailles, total, date), HTML échappé, page-break-inside avoid. data-testid: orders-print-tickets-btn, order-print-ticket-btn.
- Testé E2E : confirmation restaurée avec récap complet (screenshot validé), dialog dashboard avec tél/adresse, ticket popup contient client/tél/articles. Données de test purgées.

## Update — Feb 2026 (commandes payées uniquement + page Achat en gros)
- **Dashboard : commandes payées uniquement** — SellerContext.refreshOrders filtre `o.status === "success"` avant mapOrder : les paiements échoués/en attente n'apparaissent plus (liste, stats, badge notifications, activité en direct). Vérifié : 48 commandes → 1 payée affichée.
- **Page « Achat en gros » (/achat-en-gros, pages/Wholesale.jsx)** : titre uppercase « LANCEZ VOTRE BUSINESS AVEC UN FOURNISSEUR DE CONFIANCE », texte fournisseur/revendeurs fourni par l'utilisateur, carte contact commercial 788206060 (boutons WhatsApp wa.me/221788206060 + tel:), bannière sombre « 🌍 NOUS EXPÉDIONS PARTOUT DANS LE MONDE » + CTA boutique. Ajoutée au menu desktop (navLinks) et menu mobile (fa-boxes-stacked). data-testid: wholesale-page/-title/-contact-card/-whatsapp-btn/-call-btn/-worldwide-banner.
- Testé par screenshots : page complète OK, lien menu OK, dashboard filtré OK.

## Update — Feb 2026 (numéros de commande + retour paiement Paxity)
- **Numéros de commande séquentiels** : next_order_number() dans orders_router.py (compteur atomique db.counters {_id:'order_number'}, find_one_and_update $inc, id = str(999+seq)) → 1000, 1001, 1002… Utilisé par paxity_router (payin) et stripe_router (checkout). uuid retiré de stripe_router. Testé : 1000 puis 1001. Compteur remis à 0 en preview après tests. En PROD le compteur démarre naturellement à 1000.
- **Retour paiement Wave/OM** : l'API Paxity payin n'a AUCUN paramètre d'URL de retour client (doc officielle vérifiée : seuls amount/country/currency/phoneNumber/prefixPhone/paymentMethod/codeOtp/description/idClient/ipn). La page Wave redirige vers Paxity (config côté Paxity). Solution implémentée : lien de paiement déjà ouvert dans un NOUVEL onglet, notre onglet garde l'écran d'attente persisté qui bascule automatiquement sur la confirmation (poll + focus/visibilitychange). Texte de l'écran d'attente mis à jour : « Après le paiement, revenez sur cet onglet : votre confirmation s'affichera ici automatiquement. » RECOMMANDATION UTILISATEUR : demander à Paxity (support marchand) de configurer une URL de redirection business vers https://shoppingenchine.com/commande si disponible côté dashboard Paxity.
