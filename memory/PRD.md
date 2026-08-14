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

## Update — Feb 2026 (photo liée à la couleur)
- **Couleur → photo** : nouveau champ produit `image_colors` (tableau aligné sur `images`, hex ou null). Backend : ProductPayload.image_colors, _process_images maintient l'alignement quand des images échouent.
- **Vendeur (AddProduct)** : état photoColors synchronisé avec photos (ajout/suppression/principale/exemples), points de couleur cliquables sous chaque photo (visibles si des couleurs sont sélectionnées), data-testid photo-color-picker-{i} / photo-{i}-color-{hex}. Astuce affichée. Édition pré-remplie.
- **Client (ProductDetail)** : clic sur une couleur → setImgIdx(image_colors.indexOf(couleur)) si associée. data-testid color-option-{hex}.
- Testé E2E : produit 3 photos (rouge/bleu/blanc) + 2 couleurs associées → clic bleu change la photo, clic rouge revient ; éditeur affiche l'association (ring). Produit test purgé, DB à 0.

## Update — Feb 2026 (# devant les numéros + verrou « Bientôt disponible »)
- **Affichage #1000** : helper orderNo() (frontend lib/utils.js) et _order_no() (email_service.py) — # ajouté uniquement pour les ids numériques. Appliqué : confirmation Checkout, PaymentSuccess, toasts, Dashboard (liste + dialog), tickets colis, page suivi, emails (client/marchand/suivi). Recherche : le suivi et la recherche Dashboard tolèrent la saisie « #1000 » (strip #). FIX IMPORTANT tracking_router._normalize_order_id : ne préfixe plus « ord_ » les ids numériques (sinon 1000 → ord_1000 introuvable) + lstrip('#'). Testé.
- **Verrou de lancement (components/ComingSoon.jsx)** : le site public affiche « BIENTÔT DISPONIBLE » (fond sombre, logo, texte, 🌍) tant que le mot de passe n'est pas saisi. MOT DE PASSE = « alarba2026 » (changé le jour même à la demande de l'utilisateur) (constante SITE_PASSWORD), désactivation via GATE_ENABLED=false, déverrouillage persistant localStorage (sec_site_unlocked_v1). L'espace vendeur /vendeur et /admin reste TOUJOURS accessible. Intégré dans App.js Shell. Testé E2E : écran affiché, mauvais mdp → erreur, bon mdp → site ouvert + persistant, vendeur accessible sans mdp.

## Update — Feb 2026 (visionneuse photo plein écran)
- Tap/clic sur la photo produit → visionneuse plein écran (ProductDetail.jsx) : rendue via createPortal(document.body) pour couvrir la navbar (z-100, fond noir 95%), image object-contain non recadrée (max-h 88vh), bouton X (lightbox-close-btn), flèches desktop (lightbox-prev/next-btn), points indicateurs, swipe tactile (mêmes handlers que la galerie), tap sur le fond ferme, stopPropagation sur l'image, body overflow hidden pendant l'ouverture, cursor-zoom-in sur la photo.
- Testé : ouverture, image chargée plein écran, parent=BODY (navbar couverte), fermeture. Produit test purgé.

## Update — Feb 2026 (fix taps qui ratent — double appui nécessaire)
- CAUSE : pendant les animations d'entrée, les éléments SE DÉPLAÇAIENT (page-fade translateY(8px), fade-in-up translateY(16px)) → le doigt touchait une cible en mouvement (touchstart/touchend sur des éléments différents = pas de click) → il fallait appuyer 2 fois. En plus, le délai d'apparition des cartes était index*60ms SANS plafond → sur 92 produits, la dernière carte restait invisible ~5,5s.
- FIX (index.css) : page-fade et fade-in-up en OPACITÉ SEULE (plus aucun déplacement), durées réduites (0.25s / 0.45s). ProductCard : animationDelay plafonné à Math.min(index, 8) * 50ms.
- Testé : navigation au 1er clic OK juste après chargement.

## Update — Feb 2026 (photo produit non recadrée)
- PROBLÈME utilisateur (« la tête de la personne ne sort pas bien ») : la photo principale de la fiche produit était recadrée en carré (aspect-square + object-cover) → le haut de la tête des mannequins était coupé sur les photos portrait.
- FIX (ProductDetail.jsx) : conteneur galerie aspect-[4/5] (portrait) + object-contain → la photo s'affiche EN ENTIER sans recadrage, sur fond bg-muted. La visionneuse plein écran restait déjà en object-contain. Vignettes inchangées (object-cover, OK en petit).
- Testé : image portrait avec bandes repères haut/bas → entièrement visibles.

## Update — Feb 2026 (retour Paxity → page de confirmation)
- CONTEXTE : Paxity a configuré la redirection post-paiement vers shoppingenchine.com pour ce marchand (à la demande de l'utilisateur auprès du support).
- FIX (App.js) : composant PaymentReturnRedirect monté dans Shell — au CHARGEMENT complet de la page (mount unique), si une tx Paxity pending existe dans localStorage (sec_pending_paxity_tx_v1), redirection automatique vers /commande (écran d'attente restauré → confirmation dès succès). Exclusions : /commande, /vendeur, /admin, /paiement. Ne se déclenche PAS pendant la navigation interne (le client peut quitter /commande librement).
- TESTÉ PAR TESTING AGENT (iteration_23.json, 6/6 PASS) : retour sur '/' → redirect /commande + écran attente ; passage success en DB → confirmation avec récap complet + #1000 + localStorage nettoyé ; retour sur /boutique → redirect aussi ; pas de tx → navigation libre ; bouton Annuler → plus de redirect ; /vendeur exclu. Données de test nettoyées, compteur remis à 0, produits à 0.

## Update — Feb 2026 (Stripe passé en mode LIVE)
- Clés live fournies par l'utilisateur et configurées dans backend/.env : STRIPE_SECRET_KEY (sk_live_...), STRIPE_PUBLISHABLE_KEY (pk_live_...), STRIPE_MODE=live. STRIPE_WEBHOOK_SECRET reste celui du mode test — le webhook live n'est PAS configuré (la confirmation fonctionne via polling du statut de session, pas bloquant). Si l'utilisateur veut le webhook live : créer un endpoint https://shoppingenchine.com/api/payments/stripe/webhook dans le dashboard Stripe (mode live) et me donner le whsec_.
- Validé : session checkout LIVE créée avec succès (cs_live_...), commande #1000 test générée puis purgée, compteur remis à 0, produits à 0.
- RAPPEL : REDÉPLOYER pour que la production utilise les clés live.

## Update — Feb 2026 (Stripe Embedded Checkout FINALISÉ)
- STATUT : le paiement par carte intégré (Stripe Embedded Checkout) FONCTIONNE. Le client choisit « Carte bancaire » à l'étape 3 → clic « Payer par carte » → le formulaire Stripe (carte + Link) s'affiche DANS la page (StripeEmbedded.jsx), aucune redirection hors du site. Retour via /payment/success?session_id=... (polling PaymentSuccess.jsx, déjà en place).
- CAUSE des échecs de tests précédents : les scripts Playwright de l'outil screenshot utilisent l'API ASYNC — chaque appel (goto, fill, click, wait_for_selector, evaluate, count) doit être précédé de `await`, sinon rien ne s'exécute (coroutines jamais attendues) et les tests « réussissent » à tort puis timeout. Le code applicatif était correct. AUSSI : get_by_placeholder("Marie") doit être exact=True (collision avec "marie@exemple.com"). ET il faut pré-injecter localStorage sec_site_unlocked_v1='alarba2026' (verrou site) + sec_cart_v1 (panier) avant /commande.
- AJOUT : locale="fr" dans stripe.checkout.Session.create (stripe_router.py) → formulaire Stripe entièrement en français (« Payer en toute sécurité avec Link », « Moyen de paiement », « Informations de la carte »).
- Vérifié E2E (mode LIVE) : session cs_live_... créée avec client_secret, iframe Stripe rendue (4 iframes), montant 1 500 F CFA serveur-side, UI française. Le paiement réel n'a pas été soumis (clés live, pas de carte de test possible).
- NETTOYAGE : commandes test #1000–#1004 + transactions purgées, compteur remis à 0 (prochaine vraie commande = #1000). Le produit « Embedded test » (1 500 F) reste dans le catalogue pour permettre à l'utilisateur de faire un VRAI test carte à petit montant avant lancement — à supprimer via le dashboard vendeur ensuite.
- RAPPEL : webhook live Stripe non configuré (whsec_ actuel = mode test) ; la confirmation passe par le polling du statut (fonctionnel). REDÉPLOYER pour que la production ait locale=fr.

## Update — Feb 2026 (Multi-langue + Multi-devise + Géo-IP) TERMINÉ
- FONCTIONNALITÉ : site FR/EN + devises FCFA/EUR/USD. Règles : Europe → FR + € (1 € = 800 F), Afrique → FR + FCFA, USA/reste du monde → EN + $ (1 $ = 750 F). Détection auto par IP au 1er chargement + sélecteur manuel drapeaux (🇸🇳/🇪🇺/🇺🇸) dans la barre du haut (data-testid locale-switcher-btn, locale-option-sn/eu/us).
- LE PAIEMENT RESTE TOUJOURS DÉBITÉ EN F CFA (Stripe + Paxity inchangés). Affichage converti seulement, avec note « Le montant est débité en F CFA » quand devise ≠ XOF (data-testid stripe-xof-note, checkout-xof-note). Stripe Embedded reçoit locale fr/en (champ `locale` du POST /api/payments/stripe/checkout).
- ARCHITECTURE : /app/frontend/src/lib/locale.js (état module, RATES, formatMoney, t() dict FR→EN ~200 entrées, formatXof) ; context/LocaleContext.jsx (localStorage sec_locale_v1, GET /api/geo au 1er chargement) ; components/LocaleSwitcher.jsx ; App.js : LocaleProvider + <main key={pathname-lang-currency}> force le re-render des pages. formatPrice (ProductCard) délègue à formatMoney → conversion partout.
- BACKEND : /app/backend/geo_router.py — GET /api/geo, IP via X-Forwarded-For, cascade ipwho.is → ip-api.com → geojs.io (ipwho.is peut être rate-limited 429 depuis le pod), continent déduit de sets statiques EUROPE/AFRICA, cache mémoire. Défaut : fr/XOF.
- TRADUIT : Navbar, Footer, CartDrawer, ProductCard, Home, Products, Cart, ProductDetail, Checkout (3 étapes + Paxity + Stripe + écrans succès/attente), TrackOrder (labels d'étapes backend traduits côté client), Wholesale, About, PaymentSuccess, PaymentCancel, OrderSummary. Dashboard vendeur reste FR. Noms/descriptions produits NON traduits (choix par défaut, l'utilisateur n'a pas répondu — proposer traduction IA plus tard).
- PIÈGE IMPORTANT découvert : les search_replace PARALLÈLES sur un MÊME fichier s'écrasent mutuellement (last-write-wins) → certaines éditions « réussies » étaient perdues. Toujours éditer un même fichier SÉQUENTIELLEMENT. Un audit grep a récupéré les pertes (TrackOrder h1, Navbar placeholder mobile, CartDrawer panier vide, Products Prix/Effacer tout, Wholesale titre/paragraphes, Checkout « Choisissez votre moyen »).
- TESTS : testing agent iteration_24.json — tous les tests PASS sauf /suivi EN (corrigé ensuite + re-vérifié par screenshot : « Where is my package? » OK). Géo testé par curl X-Forwarded-For (US→en/USD, DE→fr/EUR, SN→fr/XOF). Checkout EN/USD complet + iframe Stripe EN vérifiés. Commandes de test purgées, compteur remis à 0.
- REDÉPLOYER pour pousser en production (shoppingenchine.com).

## Update — Feb 2026 (Conversions visibles sur tous les produits)
- DEMANDE UTILISATEUR (après 3 messages de frustration) : « La devise principale est le CFA, toutes les devises doivent s'appliquer dessus » → il voulait VOIR les conversions sur chaque produit (il est en Afrique donc voyait uniquement F CFA, par sa propre règle).
- IMPLÉMENTÉ : `formatEquivalents(xof)` dans locale.js — en mode FCFA affiche « ≈ 1,88 € · $2 » sous chaque prix ; en mode EUR/USD affiche « 1 500 F CFA » (rappel devise principale). Affiché sur : ProductCard (data-testid product-card-equivalents), ProductDetail (product-detail-equivalents), total CartDrawer, total page Panier, total Checkout (checkout-equivalents, seulement en mode XOF pour éviter doublon avec la note « débité en F CFA »).
- AUSSI : formatMoney affiche désormais 2 décimales pour les montants non entiers (« 12,50 € » au lieu de « 12,5 € »).
- Vérifié par screenshots (preview) : carte + fiche produit affichent « ≈ 1,88 € · $2 » sous « 1 500 F ». Production vérifiée conforme pour les conversions de base (280 produits, calculs corrects) — l'utilisateur doit REDÉPLOYER pour voir les équivalents sous les prix.
- LEÇON : quand l'utilisateur dit « la conversion n'est pas appliquée », vérifier s'il VOIT la conversion depuis sa région (Afrique = FCFA par défaut) avant de déboguer les calculs.

## Update — Feb 2026 (Tickets 100×150 mm + dashboard toujours en FCFA)
- TICKETS D'IMPRESSION (Orders.jsx seller) : format étiquette 100 × 150 mm (4 × 6 pouces) via @page{size:100mm 150mm;margin:0}, chaque .ticket = 100mm×150mm flex column avec page-break-after:always → 1 commande = 1 ticket = 1 page. Layout : entête marque + n° commande, bloc DESTINATAIRE (nom 22px, tél/adresse 15px), ARTICLES, pied Total payé + date. Vérifié par playwright : bounding box 378×567px = exactement 100×150mm @96dpi.
- DASHBOARD VENDEUR TOUJOURS EN F CFA : les pages seller (Orders, Products, Dashboard, AddProduct) utilisaient formatPrice (converti selon la devise du visiteur → totaux en $ si le navigateur était en mode USD). Remplacé par `formatCfa` (locale.js) qui affiche toujours « X F ». La boutique publique reste multi-devise.
- ASTUCE TEST : pour capturer la popup d'impression en playwright : `async with page.context.expect_page() as popup_info:` puis récupérer popup.content() et le charger dans la page principale (les screenshots de popup ne sont pas remontés par l'outil).

## Update — Feb 2026 (Nouveaux taux + paiement dans la devise du client)
- NOUVEAUX TAUX (demandés par l'utilisateur, remplacent 800/750) : 1 USD = 1000 F CFA · 1 EUR = 1260 F CFA. Mis à jour dans frontend locale.js RATES et backend stripe_router.py RATES_XOF.
- PAIEMENT RÉEL DANS LA DEVISE DU CLIENT : POST /api/payments/stripe/checkout accepte `currency` (XOF/EUR/USD). EUR/USD → line_items en centimes (round(price_xof/rate*100)) ; XOF → francs entiers (zéro décimale). L'ordre stocke amount (XOF, devise principale) + charged_currency + charged_amount. Frontend Checkout envoie currency: getLocale().currency.
- Vérifié : 1500 F → session live 1,19 € (EUR) / $1.50 (USD) / 1500 F (XOF) ; iframe Stripe embedded affiche 1,19 € + moyens de paiement européens auto (Bancontact, MB WAY, EPS). UI : note « Vous payez par carte dans votre devise » (stripe-currency-note), note Paxity « débité en F CFA » (paxity-xof-note) quand devise ≠ XOF.
- STRIPE LIVE EN PRODUCTION : la préversion crée cs_live mais PRODUCTION (shoppingenchine.com) crée encore cs_test → les env vars de prod sont gérées séparément du .env. L'utilisateur doit mettre à jour STRIPE_SECRET_KEY/STRIPE_MODE/REACT_APP_STRIPE_PUBLISHABLE_KEY dans les settings du déploiement (ou contacter support@emergent.sh) puis redéployer. Compteur de commandes en PROD ≈ 1013 (commandes test faites en prod, non nettoyables depuis la préversion).
- Commandes test préversion purgées, compteur remis à 0.

## Update — Feb 2026 (Barème de prix final + plus de CFA pour Europe/USA)
- BARÈME FINAL (défini par exemples utilisateur) : produit à 9 000 F CFA = 13 € = 15 $. Donc RATES = {EUR: 9000/13 ≈ 692.31, USD: 600}. Appliqué frontend (locale.js) + backend (stripe_router.py RATES_XOF) → le client paie réellement ce montant par carte (ex 1500 F → 2,17 € / $2.50, vérifié en base charged_amount).
- LES CLIENTS EUROPE/USA NE VOIENT PLUS AUCUN PRIX EN F CFA : formatEquivalents retourne "" hors mode XOF (rendu conditionnel dans ProductCard, ProductDetail, CartDrawer, Cart) ; notes « débité en F CFA » supprimées du checkout (checkout-xof-note, paxity-xof-note supprimés). Vérifié par scan regex de la page produit en mode EUR : zéro occurrence de F CFA. En mode XOF les équivalents « ≈ 2,17 € · $2.50 » restent affichés.
- Historique des taux (ne pas réutiliser) : 800/750 → 1000/1260 → FINAL 692.31 (EUR) / 600 (USD).

## Update — Feb 2026 (Ticket style bon de livraison Shopify)
- L'utilisateur a fourni une photo de référence (packing slip Shopify) : le ticket 100×150mm est refait à l'identique — marque en haut gauche, « Commande #X + date » en haut droite, 2 colonnes EXPÉDIER À / FACTURER À (client + adresse + Sénégal + tél), tableau ARTICLES/QUANTITÉ (« 1 sur 1 »), traits noirs épais, pied de page centré « Merci pour votre achat ! » + SHOPPING EN CHINE + sicap mbao, 17000 Dakar, Sénégal + balatoumata414@gmail.com + shoppingenchine.com.
- Écriture GRANDE ET NOIRE (font-weight 900/bold partout, #000). PAS de prix sur le ticket (conforme à la référence). fmtF supprimé (inutilisé).
- Vérifié par capture du popup d'impression.

## Update — Feb 2026 (Barème v4 — ACTUEL)
- NOUVEAU BARÈME (remplace 13€/15$) : produit à 9 000 F CFA = 28 € = 32 $. RATES = {EUR: 9000/28 ≈ 321.43, USD: 9000/32 = 281.25} dans locale.js + stripe_router.py.
- Vérifié : 1500 F → 4,67 € / $5.33 (affichage équivalents + charged_amount en base identiques). Historique taux : 800/750 → 1260/1000 → 692/600 → ACTUEL 9000/28 et 9000/32.

## Update — Feb 2026 (Devise 100% automatique, plus de sélecteur manuel)
- DEMANDE : les visiteurs NE PEUVENT PLUS changer la devise manuellement. Géo IP décide seule : Europe → FR/€, Afrique → FR/FCFA, USA/reste → EN/$.
- LocaleContext.jsx réécrit : plus de localStorage sec_locale_v1, appel /api/geo à chaque chargement, plus de setLocale exposé. LocaleSwitcher.jsx SUPPRIMÉ. Navbar affiche un indicateur statique non cliquable (data-testid locale-indicator, drapeau + « FR · € »).
- Vérifié par playwright avec header X-Forwarded-For 78.46.0.1 (Allemagne) : site auto en €, prix 4,67 €, aucun F CFA, aucun bouton de changement.
- NOTE : les anciens visiteurs avec sec_locale_v1 en localStorage ne sont plus affectés (clé ignorée).

## Update — Feb 2026 (Modes de livraison : économique / express)
- ÉTAPE 2 CHECKOUT (avant paiement) : 2 boutons sélectionnables (components/DeliveryOptions.jsx) — « Livraison économique Chine-Dakar » 15-20 j ouvrés · 6 500 F/kg et « Livraison express Chine-Dakar » 5-7 j ouvrés · 11 000 F/kg. Cliquer sélectionne + déploie le texte explicatif COMPLET fourni par l'utilisateur (pesée du colis, calcul poids × tarif, paiement avant expédition ou à l'arrivée, livraison domicile 2 000 F). data-testids: delivery-standard-btn/-details, delivery-express-btn/-details.
- Montants via formatMoney (convertis €/$ pour Europe/USA, texte traduit EN via dict). NOTE : l'utilisateur avait écrit « Poids du colis (en grammes) x 6500 » — corrigé en « (en kg) » (sinon calcul ×1000) ; signalé à l'utilisateur.
- Choix stocké dans la commande : `delivery_mode` (standard|express) envoyé par le frontend et enregistré par stripe_router + paxity_router (défaut standard). Vérifié en base.
- Textes de livraison sur la fiche produit (onglet Livraison) inchangés (10-20 jours) — à harmoniser si l'utilisateur le demande.

## Update — Feb 2026 (Livraison Europe : option unique 13 €/kg)
- DeliveryOptions.jsx restructuré : getDeliveryModes() selon getLocale().currency — XOF → 2 options Dakar (6500/11000 F/kg) ; EUR/USD → UNE seule option « Livraison Chine-Europe » 15-20 j ouvrés · 13 €/kg avec texte spécifique (remboursement intégral perte/douane, paiement des frais AVANT expédition via lien sécurisé, assistante contacte à l'arrivée dans le pays, livraison à charge du client ou remise en main propre).
- 13 €/kg encodé comme rateXof = 13×9000/28 ≈ 4178,57 F → affiche 13 € pile en mode EUR, ≈ $14.86/kg en mode USD (PAS de tarif USA spécifique fourni par l'utilisateur — à confirmer avec lui). Textes traduits EN pour les visiteurs USD.
- delivery_mode stocké reste "standard" pour l'option Europe. Vérifié par screenshot avec IP allemande : 1 seule option, texte complet, « Poids du colis (en kg) × 13 € ».

## Update — Feb 2026 (Livraison USA : option unique 18 $/kg)
- US_MODES ajouté dans DeliveryOptions.jsx : « Livraison Chine-USA » 15-20 j ouvrés · 18 $/kg (rateXof = 18×9000/32 = 5062,5 F → $18 pile en USD), texte identique à l'Europe mais « jusqu'à New York » / « à New York ». getDeliveryModes(): XOF→2 options Dakar, EUR→Chine-Europe 13 €/kg, USD→Chine-USA 18 $/kg.
- Traductions EN ajoutées. Vérifié par screenshot IP 8.8.8.8 : « China-USA shipping · $18/kg », texte anglais complet.

## Update — Feb 2026 (Livraison Canada : 20 $/kg + détection pays)
- LocaleContext + locale.js stockent maintenant le country_code retourné par /api/geo (current = {lang, currency, country}).
- CA_MODES : « Livraison Chine-Canada » 15-20 j ouvrés · 20 $/kg (rateXof = 20×9000/32 = 5625 F). Texte identique Europe (générique « dans votre pays », sans New York). getDeliveryModes(): USD + country==='CA' → CA_MODES, sinon US_MODES. Canadiens paient en USD (déjà le cas via bucket reste-du-monde du geo_router).
- NOTE : le message utilisateur disait titre « 20$/kg » mais calcul « x 18$ » — uniformisé à 20 $ (signalé à l'utilisateur).
- Vérifié par screenshot IP 24.48.0.1 (Canada) : « China-Canada shipping · $20/kg », calcul « Package weight (in kg) × $20 », texte EN complet.

## Update — Feb 2026 (Texte livraison repliable via flèche)
- Le texte explicatif du mode de livraison n'apparaît PLUS automatiquement à la sélection : caché par défaut, affiché uniquement au clic sur le bouton flèche (data-testid delivery-{id}-toggle), re-clic pour refermer. Sélection (carte) et détails (flèche) sont deux boutons distincts (state expanded local à DeliveryOptions).
- Testé : 0 texte avant clic → 1 après clic → 0 après re-clic.

## Update — Feb 2026 (Mode de livraison visible dashboard + ticket)
- SellerContext mapOrder expose deliveryMode (o.delivery_mode, défaut standard). Orders.jsx : badge STANDARD (gris) / EXPRESS (ambre) sous le n° de commande de chaque ligne (data-testid order-delivery-{id}) + badge dans le dialog détail (order-detail-delivery).
- Ticket d'impression : encadré noir gras sous l'entête « Livraison : STANDARD (15–20 jours ouvrés) » ou « EXPRESS (5–7 jours ouvrés) » (classe .ship).
- Vérifié par screenshot (dashboard + ticket).

## Update — Feb 2026 (Bug email de confirmation — RCA + redesign)
- BUG « pas d'email de confirmation » : le code déclenche bien les emails (client + marchand) à chaque paiement réussi (stripe_router ~178, paxity_router ~581/642/699). CAUSE RÉELLE : Resend en MODE TEST (SENDER_EMAIL=onboarding@resend.dev) → n'envoie QU'À bafatoumata414@gmail.com ; tout autre destinataire est rejeté (erreur visible dans backend.err.log). ACTION UTILISATEUR REQUISE : vérifier le domaine shoppingenchine.com sur resend.com/domains puis changer SENDER_EMAIL (ex: commandes@shoppingenchine.com) dans backend/.env ET dans les env vars de production.
- EMAIL CLIENT REDESSINÉ (email_service.py) : en-tête noir SHOPPING EN CHINE + tagline dorée, badge vert « Paiement confirmé », tableau articles pro, total en rouge, carte adresse de livraison, bouton « Suivre ma commande », footer coordonnées (balatoumata414@gmail.com — orthographe issue du ticket photo de l'utilisateur ; MERCHANT_EMAIL est bafatoumata414@gmail.com, à confirmer).
- TESTS (iteration_25, 5/5 PASS, backend) : envoi OK vers l'adresse owner, idempotence OK (pas de doublon), rejet attendu vers autres adresses avec flag libéré pour retry, HTML validé. Fichier: /app/backend/tests/test_email_service.py (ne pas utiliser pytest-asyncio).

## Update — Feb 2026 (Nouvelle clé Resend)
- Ancienne clé Resend remplacée. Nouveau compte Resend = commands@shoppingenchine.com (adresse owner détectée via l'erreur 403 test-mode). backend/.env : RESEND_API_KEY=re_HXY4... (nouvelle), MERCHANT_EMAIL=commands@shoppingenchine.com, SENDER_EMAIL=onboarding@resend.dev (test mode).
- Envoi test réussi (id 3b1c9eb4...) vers commands@shoppingenchine.com. Domaine shoppingenchine.com PAS ENCORE vérifié sur ce compte → les clients ne reçoivent pas encore ; dès vérification sur resend.com/domains, passer SENDER_EMAIL=commandes@shoppingenchine.com (et mettre à jour les env vars de PRODUCTION : RESEND_API_KEY + MERCHANT_EMAIL + SENDER_EMAIL).

## Update — Feb 2026 (Suppression des placeholders d'exemple)
- Formulaire « Adresse de livraison » (Checkout.jsx) : suppression de TOUS les placeholders d'exemple (Marie, Dupont, marie@exemple.com, Rue quartier…, 10000, Dakar, 77 XXX XX XX) — champs vides désormais. Idem champ téléphone Paxity (77 XXX XX XX) et login vendeur (vous@exemple.com).
- Conservés (fonctionnels, pas des exemples) : barres de recherche, « Laissez vide si non requis » (OTP), newsletter footer, placeholders du dashboard vendeur (aides à la saisie produit).
- Vérifié par screenshot sur /commande : 7 champs du formulaire sans placeholder.
- RAPPEL ROUTE : la page de commande est /commande (PAS /checkout).

## Update — Feb 2026 (Prix CFA uniquement pour l'Afrique)
- formatEquivalents() (lib/locale.js) retourne désormais TOUJOURS "" : les clients en zone CFA ne voient plus la ligne « ≈ 24,89 € · $28.44 » sous les prix. Chaque région ne voit QUE sa devise (Afrique=F CFA, Europe=€, USA/Canada=$).
- Checkout.jsx : bloc équivalents retiré du récapitulatif + import formatEquivalents supprimé (attention : ce bloc était déjà dans un conditionnel getLocale — une édition imbriquée avait cassé la compilation, corrigée).
- Vérifié par screenshot /boutique : aucun symbole ≈, compilation OK.

## Update — Feb 2026 (Branding « Livraison Chine → Monde entier »)
- Tout le branding « Livraison Chine → Dakar » remplacé par une formulation internationale professionnelle :
  - FR : « Livraison de la Chine vers le monde entier » (long) / « Livraison Chine → Monde entier » (court, récap panier/commande/fiche produit)
  - EN : « Worldwide delivery from China » / « China → Worldwide delivery »
- Fichiers modifiés : locale.js (clés FR + traductions EN), Navbar (topbar), Footer, Home (hero + bénéfices), CartDrawer, Cart, Checkout, ProductDetail, PaymentSuccess, ComingSoon, About (meta + feature), Products (meta), usePageTitle (titre par défaut), public/index.html (title + og:title + meta description).
- CONSERVÉ volontairement : les options de livraison régionales Dakar (DeliveryOptions, économique/express Chine-Dakar, frais 2000 F Dakar), l'étape de suivi « En livraison à Dakar », et l'adresse physique Dakar dans l'email — ce sont des infos opérationnelles, pas du branding.
- Vérifié par screenshot : topbar + hero affichent « Worldwide delivery from China » (EN auto par géoloc IP US du pod), aucun « Dakar » branding sur la home.

## Update — Feb 2026 (Recherche instantanée / autocomplete)
- Nouveau composant /app/frontend/src/components/SearchSuggestions.jsx : dropdown de suggestions 100% CLIENT-SIDE (catalogue déjà chargé via useCatalog + moteur productMatchesQuery de lib/search.js — pas de nouvel endpoint backend, zéro latence).
- Affiche max 6 produits : miniature (p.image), nom, catégorie traduite, prix (formatMoney → devise du visiteur), + lien « Voir tous les résultats (N) » → /boutique?q=. État vide : « Aucun produit trouvé ».
- Intégré à 3 endroits : Navbar desktop (dropdown 360px aligné droite, data-testid navbar-search-input), Navbar mobile overlay (navbar-mobile-search-input), hero Home (home-search-input). Ouverture au focus/saisie (≥2 caractères), fermeture au blur/Escape/clic.
- ASTUCE UX : onMouseDown preventDefault sur le dropdown pour que le clic sur une suggestion parte AVANT le blur de l'input (sinon le menu se ferme et le clic est perdu).
- Testé par screenshot : suggestion visible avec image+prix, clic → navigation fiche produit OK, requête sans résultat → message OK. Traduction EN ajoutée (« See all results »).

## Update — Feb 2026 (Bug : fenêtre Paxity qui se rouvre au retour Wave/OM)
- CAUSE : le bouton « Payer maintenant » (écran d'attente Paxity, Checkout.jsx ~399) avait target="_blank" → la page de paiement Paxity s'ouvrait dans un NOUVEL onglet. Au retour de l'app Wave/OM, le navigateur mobile raffichait cet onglet Paxity orphelin (perçu comme « une nouvelle fenêtre Paxity s'ouvre ») au lieu de la boutique.
- FIX : target="_blank" retiré → paiement dans le MÊME onglet. Le site est déjà conçu pour ça : la transaction pending est persistée dans localStorage (clé sec_pending_paxity_tx_v1) et restaurée au rechargement de /commande, avec polling auto (3,5s + visibilitychange/focus) jusqu'à confirmation.
- Vérifié par screenshot : pending screen restauré depuis localStorage, attribut target absent du lien.

## Update — Feb 2026 (Nettoyage étape Paiement)
- Supprimé le badge « PAXITY PRODUCTION » à côté du titre « Paiement » (Checkout.jsx step 3, span paxityConfig.environment).
- Supprimé le bandeau indigo « Paiement par carte sécurisé (Visa, Mastercard) / Payez directement sur le site, sans redirection » du panneau carte Stripe.
- Conservé : la ligne discrète « Paiement sécurisé via Stripe/Paxity · Chiffrement bout-en-bout » (réassurance).
- Vérifié par screenshot e2e (adresse → livraison → paiement, boutons « Continue » type=button, PAS de submit ; attention le footer newsletter a aussi un bouton submit qui piège les sélecteurs génériques).

## Update — Feb 2026 (Sélecteur de pays + indicatif automatique au checkout)
- Nouveau fichier /app/frontend/src/lib/countries.js : 33 pays (Afrique/Europe/US/CA) avec {code ISO2, fr, en, dial, flag} + findCountry() + countryName() (nom selon langue).
- Checkout.jsx : champ « Pays » (shadcn Select, data-testid country-select / country-option-XX) dans le formulaire d'adresse. changeCountry() → setPrefix(dial) automatiquement. Pays pré-sélectionné depuis la géoloc IP (getLocale().country), défaut SN.
- Téléphone : badge indicatif non éditable « 🇸🇳 +221 » (data-testid phone-prefix) accolé à gauche de l'input.
- L'ancien setPrefix() dans le fetch paxityConfig SUPPRIMÉ (il écrasait l'indicatif du pays). Le choix d'un opérateur mobile money spécifique (étape paiement) peut toujours ajuster le prefix (comportement voulu).
- Le nom du pays est ajouté à l'adresse envoyée dans les payloads Stripe & Paxity (visible sur ticket vendeur).
- Testé par screenshot : init 🇺🇸 +1 (IP pod US) → France +33 → Sénégal +221. Traductions "Pays"/"Choisissez votre pays" ajoutées.

## Update — Feb 2026 (États US / Provinces Canada au checkout)
- countries.js : export STATES = {US: [50 états + DC], CA: [13 provinces/territoires]}.
- Checkout.jsx : Select « État » (US) / « Province » (CA) affiché uniquement si STATES[buyer.country] existe (data-testid state-select / state-option-Xxx avec espaces→tirets). buyer.state reset au changement de pays, requis dans buyerValid() pour US/CA, inclus dans l'adresse envoyée (address, zip, state, pays).
- Traductions ajoutées : État/State, Province, Choisissez votre état/province.
- Testé par screenshot : US auto-détecté → champ État (New York OK) ; Canada → Province (Quebec OK, indicatif 🇨🇦 +1) ; Sénégal → champ masqué.

## Update — Feb 2026 (Prix EUR/USD par produit — Dashboard vendeur)
- BACKEND : ProductPayload (products_router.py) + priceEur/priceUsd Optional[float] gt=0 (null accepté pour effacer). stripe_router.py : unit_amount = prix explicite vendeur (priceEur/priceUsd × 100 centimes) prioritaire, sinon conversion barème fixe.
- FRONTEND helpers (locale.js) : unitAmount(p) (priorité priceEur/priceUsd sinon RATES), fmtAmount(v), formatProductMoney(p), cartDisplayTotal(items). formatEquivalents SUPPRIMÉ partout (mort).
- Affichages migrés vers helpers : ProductCard, ProductDetail, SearchSuggestions, CartDrawer, Cart, Checkout (récap + boutons Payer). Paxity reste 100% XOF (inchangé). Le panier (localStorage sec_cart_v1) stocke le produit slim complet → priceEur/priceUsd suivent automatiquement ; les articles ajoutés AVANT la feature n'ont pas ces champs (fallback conversion, OK).
- DASHBOARD : AddProduct.jsx → 2 champs optionnels « Prix en euros » (price-eur-input) / « Prix en dollars » (price-usd-input), aide « 9 000 F = 28 € = 32 $ si vide », aperçu live (preview-multi-currency), pré-remplissage en édition, envoi null si vide.
- data-testid ajoutés : cart-qty-plus-{line} / cart-qty-minus-{line} sur /panier.
- TESTÉ (iteration_27.json) : backend 5/5 (persist, Stripe EUR 25.0, USD x2 60.0, fallback 32.0), frontend ~95% (form+preview+édition+affichage $30+panier $60 OK). Faux positif qty→checkout re-vérifié par main agent : OK ($60 partout). Commandes QA pending nettoyées de la DB. Fichier test : /app/backend/tests/test_multicurrency_iter27.py.

## Update — Feb 2026 (Suppression champ « Prix barré » du Dashboard)
- AddProduct.jsx : champ UI « Prix barré (optionnel) » supprimé de la carte Prix. State/prefill/submit oldPrice CONSERVÉS volontairement (les produits existants avec oldPrice gardent leur prix barré en boutique et en édition).
- Vérifié par screenshot connecté au dashboard : champ absent, EUR/USD présents.
- NOTE testing : l'injection directe du token via urllib échoue (403 WAF) — se connecter via le formulaire /vendeur (Se connecter) dans Playwright.

## Update — Feb 2026 (NOUVEAU TAUX DE CHANGE : 9000 F = 17 € = 19 $)
- Ancien barème 9000 F = 28 € = 32 $ REMPLACÉ par 9000 F = 17 € = 19 $ (demande explicite du marchand).
- Modifié : locale.js RATES (9000/17, 9000/19), stripe_router.py RATES_XOF, AddProduct.jsx texte d'aide, products_router.py commentaire, DeliveryOptions.jsx (EU_RATE_XOF/US_RATE_XOF/CA_RATE_XOF recalés pour afficher toujours 13 €/kg, $18/kg, $19-20/kg pile).
- VALIDÉ : Stripe checkout 9000 F → charged 17.00 EUR / 19.00 USD exactement (curl + DB) ; boutique affiche $3.17 pour 1500 F (ancien $5.33). Commandes/produit QA nettoyés.
- RAPPEL : ce barème NE s'applique QUE si le vendeur n'a pas mis de priceEur/priceUsd explicites sur le produit.

## Update — Feb 2026 (Ticket 100x150 : plein format + adresse Guangzhou)
- Orders.jsx printTickets : .ticket passe de taille fixe 100mm×150mm à 100vw×100vh en impression → couvre TOUTE la feuille et reste centré quelle que soit l'imprimante/le driver (la taille fixe causait le décalage et la moitié vide constatés sur photo). Aperçu écran reste 100mm×150mm.
- Polices fortement agrandies : brand 25px, ship 18px, who 20px, addr 17px, item-name 19px, fline 15px, traits 2.5px.
- .items{flex:1 1 auto;min-height:0} (l'ancien flex:1 + overflow:hidden coupait le nom d'article multi-lignes).
- Adresse société changée : « sicap mbao, 17000 Dakar, Sénégal » → « Guangzhou, 510000 Guangdong, Chine » (ticket + footer email_service.py).
- « Sénégal » codé en dur retiré des blocs Expédier à / Facturer à (le pays du client est maintenant dans l'adresse via le sélecteur pays).
- Vérifié par screenshot d'un aperçu HTML du ticket (fichier temporaire supprimé).

## Update — Feb 2026 (DEEP FIX retour Wave/OM — IPN + watcher serveur)
- ENQUÊTE : la fenêtre paxity.io au retour de Wave est la page de retour de la session checkout Wave (pay.wave.com/c/cos-...) créée PAR Paxity — URL de retour non modifiable (doc API officielle vérifiée : champs payin = amount, country, currency, phoneNumber, prefixPhone, paymentMethod, codeOtp, description, idClient, ipn — AUCUN redirect/successUrl).
- ROOT CAUSE côté nous : PAXITY_IPN_URL="" (vide) dans .env → le champ ipn n'était JAMAIS envoyé → 0 IPN reçus en base → confirmation 100% dépendante du navigateur client.
- FIX 1 : _public_ipn_url(request) dans paxity_router.py — dérive l'URL webhook du host public (x-forwarded-host/proto) → https://shoppingenchine.com/api/paxity/webhook en prod, URL preview en preview, "" en local. PAXITY_IPN_URL (.env) reste prioritaire si défini.
- FIX 2 : webhook — si l'IPN ne contient pas idClient, lookup de l'order_id via la transaction (avant : commande jamais mise à jour). Testé via curl IPN FAILED sans idClient → tx + order passés à failed.
- FIX 3 : _watch_pending_tx (filet de sécurité) — après chaque payin pending, tâche asyncio qui interroge Paxity toutes les 20s pendant 15 min : commande confirmée + emails envoyés MÊME si le client ne revient jamais. Partage _refresh_pending_tx avec GET /status (refactor).
- FIX 4 : écran d'attente Checkout — message « Après validation, revenez sur cette page... vous pouvez fermer la page de paiement » (data-testid paxity-return-hint) + traduction EN.
- TESTS : /app/backend/tests/test_paxity_return_fixes.py (4 passed). Payin réel 100 F créé → log confirme 'ipn': URL preview envoyée → stoppé via webhook FAILED → nettoyé de la DB.
- ATTENTION ÉDITIONS : paxity_router.py a subi une corruption de fin de fichier lors d'un search_replace (bloc dupliqué « }) ... return order ») — réparée. Toujours vérifier ast.parse après édits sur ce fichier.

## Update — Feb 2026 (Ticket : retour au format fixe 1 étiquette)
- REGRESSION CONSTATÉE (photo user) : .ticket en 100vw/100vh débordait sur 2 étiquettes (vh en print = viewport driver, pas la page @page). 
- FIX FINAL : .ticket{width:100mm;height:149mm;overflow:hidden} (149mm = marge de sécurité anti-retombée) + @page 100mm 150mm margin 0. Grandes polices conservées (brand 25px, who 20px, item 19px), foot en bas via margin-top:auto.
- Ajout bandeau .print-hint (visible à l'écran, display:none à l'impression) : « Papier 100×150 mm · Échelle 100% · Marges Aucune » — le décalage/moitié vide de la 1re photo venait du driver qui réduisait la page (échelle auto).
- Vérifié via émulation media print : hauteur ticket exactement 563px (=149mm) → 1 page par ticket garanti ; hint masqué en print.
- LEÇON : ne JAMAIS utiliser vw/vh dans les documents à imprimer sur étiquettes ; toujours des mm fixes < taille @page.

## Update — Feb 2026 (Ticket centré + suppression bouton lien Paxity)
- Ticket : .ticket{width:94mm;height:142mm;margin:4mm auto 0} → contenu poussé vers le milieu de l'étiquette 100×150 (marges ~3mm côtés + 4mm haut), toujours 1 page par ticket (146mm < 150mm). Vérifié en émulation print (355×537px).
- Écran d'attente Paxity (Checkout.jsx) : bouton « Payer maintenant » (payment_link → page paxity/wave) SUPPRIMÉ à la demande du user — seul le QR code reste (data-testid paxity-qr-code). data-testid paxity-payment-link-btn n'existe plus.
- ⚠️ RISQUE SIGNALÉ AU USER : sans le lien, un client Wave SUR MOBILE ne peut pas scanner son propre écran → si les paiements Wave mobiles chutent, proposer de remettre le bouton uniquement sur mobile. (Orange Money passe par OTP direct, non affecté.)

## Update — Feb 2026 (Bouton Payer maintenant restauré + fermeture auto fenêtre Paxity)
- Le user a refusé la suppression du bouton (« ne supprime pas button payer mtn lol ») : ce qu'il voulait = supprimer la fenêtre paxity.io qui reste ouverte APRÈS le paiement.
- SOLUTION : Checkout.jsx — payWindowRef (useRef) + openPayWindow(url) via window.open(url, "sec_paxity_pay") (fenêtre nommée fermable par l'opener) + closePayWindow(). Le bouton « Payer maintenant » (paxity-payment-link-btn) rouvre la page paiement dans cette fenêtre.
- closePayWindow() appelé dès que le polling (checkNow) ou manualCheck détecte status success/failed → la fenêtre paxity.io se FERME AUTOMATIQUEMENT et le client retrouve la boutique avec sa confirmation.
- Testé Playwright : clic → fenêtre ouverte (1→2 pages), fermeture par l'opener OK (2→1). QR code conservé.
- Limite connue : si l'onglet boutique est en arrière-plan sur mobile, le polling peut être ralenti (throttling) → fermeture en léger différé ; le watcher serveur + IPN garantissent quand même la confirmation.

## Update — Feb 2026 (Ticket redesigné façon photo de référence user)
- ticketHtml (Orders.jsx) réécrit dans le style du ticket historique (photo oct. 2025) :
  - MINIATURES produits : it.image déjà fourni par SellerContext.mapOrder (lookup productsById) ; URLs relatives converties en absolues (window.location.origin) car document.write dans window.open ; impression attend l'événement load (+ filet 2s) pour laisser charger les images.
  - Nom d'article splitté sur " — " → ligne nom (700) + ligne variante/taille (400).
  - Typo affinée : brand 20px/800, ship ligne discrète uppercase (plus de gros cadre), who 15px, addr 14px normal, item 15px, foot centré 13-14px, règles 1.5px.
  - .items{flex:1 1 auto} SANS min-height:0 (min-height:0 laissait la zone se compresser → chevauchement du footer ; sans, le pire cas = footer coupé proprement par overflow:hidden du ticket).
- Testé : sample avec adresses longues + 2 articles à variantes = tout tient sur 1 étiquette 142mm, footer complet visible.

## Update — Feb 2026 (Ticket compact + suppression miniatures)
- Miniatures produits SUPPRIMÉES du ticket (demande user « pourquoi je vois la photo... supprime-le ») — item = nom + variante + qty seulement. absImg/attente-images retirés (retour setTimeout 400ms).
- Layout compact : .items sans flex:1, .foot sans margin-top:auto → le pied de page vient JUSTE APRÈS les articles (comme la photo de référence), plus de grand vide avec 1 seul article. Le ticket garde height:142mm fixe (1 étiquette).
- Téléphone : <meta name="format-detection" content="telephone=no"> + a{color:inherit;text-decoration:none} → plus de lien bleu souligné sur iOS/Safari.
- BUG RÉCURRENT : 2e corruption de fin de fichier par search_replace (Orders.jsx lignes dupliquées après }) — supprimées via sed. TOUJOURS lint après édition de gros fichiers JSX.
- Vérifié par screenshot : ticket compact, sans photo, téléphone noir.

## Update — Feb 2026 (Ticket multi-étiquettes pour grosses commandes)
- Test user « crée une commande avec 11 articles » a révélé : au-delà de ~7 articles, le ticket était COUPÉ (overflow:hidden).
- FIX : ticketHtml pagine les articles → 6 sur l'étiquette 1 (avec adresses complètes), 7 par étiquette suivante (en-tête compact : Commande # · Page i/n · nom client), pied de page uniquement sur la dernière, mention « Suite des articles sur l'étiquette suivante → » (.more italique 12px). En-tête indique « Articles (N) » total quand multi-pages.
- Commande démo #9911 (Awa Ndiaye, 11 articles, EXPRESS, 114000 F, status success) laissée dans la DB PREVIEW pour que le user teste l'impression. La supprimer plus tard si demandé (db.orders id="9911").
- Vérifié e2e via dashboard réel : 2 .ticket générés, page 1 = 6 articles, page 2 = 5 articles + footer, rien de coupé.

## Update — Feb 2026 (Ticket : tout sur UNE seule étiquette, densité auto)
- Le user a refusé la pagination multi-étiquettes : TOUT doit tenir sur la même feuille.
- FIX : pagination supprimée, remplacée par densité automatique : classe .ticket--dense (7-12 articles, item-name 12px, variante inline à côté du nom) et .ticket--ultra (13+, 10.5px). ≤6 articles = tailles confortables inchangées. En-tête indique « Articles (N) ».
- Vérifié e2e avec la commande #9911 (11 articles) : 1 seule étiquette, footer bottom (616px) < ticket bottom (645px), rien de coupé, tout lisible.

## Update — Feb 2026 (Fenêtre Paxity post-paiement — vérifié par testing agent, iteration_28)
- Question user récurrente : « pourquoi après paiement Paxity une nouvelle fenêtre paxity s'ouvre au lieu de la confirmation » → RÉPONSE : page de retour hébergée par Paxity (Wave redirige vers paxity.io, non modifiable — doc API vérifiée). PARADE en place et TESTÉE : window.open nommé + closePayWindow() dès success/failed.
- Renforcements : polling 2s (au lieu de 3,5s) pendant pending + useEffect complete→closePayWindow.
- TESTÉ E2E (iteration_28.json, 100% pass) : clic Payer maintenant → fenêtre ouverte → webhook SUCCESS → fenêtre FERMÉE AUTO en ~1-2s + écran confirmation affiché + DB à jour. Seed qa_close_1 nettoyé.
- Fixes mineurs testing agent : key={it.line || it.id} dans le récap Checkout, <img> conditionnel si image vide (Checkout + CartDrawer).
- IMPORTANT pour le user : la prod shoppingenchine.com doit être REDÉPLOYÉE pour bénéficier de tout ça. Sur mobile, si l'onglet boutique est en arrière-plan, la fermeture peut prendre quelques secondes de plus (throttling navigateur).

## Update — Feb 2026 (BUG : clients ne reçoivent pas l'email de confirmation — FIXÉ, iteration_29)
- RCA double : (a) SENDER_EMAIL=onboarding@resend.dev (sandbox Resend → livraison UNIQUEMENT au propriétaire du compte, jamais aux clients) ; (b) domaine shoppingenchine.com NON VÉRIFIÉ chez Resend (envoi depuis serviceclients@ rejeté « domain is not verified »). Clé Resend = restreinte send-only (impossible de lister les domaines par API, 401 restricted_api_key).
- FIX : email_service.py — _send_raw() essaie D'ABORD serviceclients@shoppingenchine.com, et si « not verified » → repli auto sur onboarding@resend.dev + WARNING log explicite. Utilisé par les emails marchand ET client. SENDER_EMAIL env mis à jour (variable code supprimée, constantes OFFICIAL_SENDER/FALLBACK_SENDER).
- Dès que le user vérifie le domaine sur resend.com/domains (DNS SPF/DKIM), les clients reçoivent AUTOMATIQUEMENT, sans redéploiement de code (mais prod doit avoir cette version du code → redéployer une fois).
- TESTÉ (iteration_29, 100%, 5/5 pytest /app/backend/tests/test_email_fallback.py) : webhook SUCCESS → emails marchand+client acceptés par Resend (ids retournés), flags DB ok, idempotence ok (2e webhook = 0 renvoi), cleanup fait.
- ACTION USER REQUISE : ajouter et vérifier shoppingenchine.com sur https://resend.com/domains (ajouter les enregistrements DNS SPF + DKIM chez son registrar). SANS ÇA les clients ne recevront toujours rien (limite Resend, pas un bug code).

## Update — Feb 2026 (Aperçu de partage avec logo — Open Graph)
- Généré /app/frontend/public/og-image.png (1200×630, 37KB, PIL + LiberationSans-Bold : badge S terracotta #c64c3a, SHOPPING EN CHINE, tagline livraison monde + paiements, shoppingenchine.com, fond crème #f4f1ec) et logo512.png (512×512 carré, favicon/apple-touch-icon).
- index.html : og:image (URL ABSOLUE https://shoppingenchine.com/og-image.png — WhatsApp/FB scrapent la prod), og:url, og:site_name, og:image:width/height/alt, twitter:card summary_large_image + title/description/image, favicon+apple-touch-icon → logo512.png.
- ATTENTION : frontend dev server NE recharge PAS public/index.html à chaud → supervisorctl restart frontend nécessaire. Vérifié servi (grep og:image OK, /og-image.png 200).
- NOTE : WhatsApp/Facebook mettent l'aperçu en cache — après redéploiement, utiliser https://developers.facebook.com/tools/debug/ (bouton Scrape Again) pour forcer le rafraîchissement.
- EN ATTENTE USER : choix a/b/c sur la gestion de la fenêtre Paxity (fermeture auto actuelle / même onglet / iframe) — question posée, pas encore répondue.

## Update — Feb 2026 (Domaine Resend VÉRIFIÉ — emails clients opérationnels)
- Le user a vérifié shoppingenchine.com chez Resend (DNS). Test direct : envoi depuis serviceclients@shoppingenchine.com OK (id retourné, plus d'erreur 'not verified').
- Test e2e : seed commande qa_dns_1 (client = Gmail du user) + webhook SUCCESS → logs '[Email] Order confirmation sent' + '[Email:customer-confirm] sent to Modou.ba.568@gmail.com' SANS warning de repli → les clients EXTERNES reçoivent désormais leurs confirmations depuis l'adresse officielle. Seed nettoyé.
- Le fallback _send_raw reste en place (inoffensif, ne se déclenche plus).
- RAPPEL : la PRODUCTION doit être redéployée pour avoir email_service.py avec _send_raw (sinon prod utilise encore l'ancien code avec SENDER_EMAIL env ; en prod l'env var SENDER_EMAIL doit être serviceclients@shoppingenchine.com — vérifier les env vars de déploiement).

## Update — Feb 2026 (Destinataire marchand verrouillé — iteration_30, 100%)
- BUG : bafatoumata414@... recevait encore les notifications (via env var MERCHANT_EMAIL de la PRODUCTION — jamais présente dans le code preview).
- FIX : email_service.py → MERCHANT_EMAIL = "commands@shoppingenchine.com" EN DUR (env ignorée). Env var MERCHANT_EMAIL supprimée de backend/.env (morte). Log marchand inclut désormais to=<adresse>.
- TESTÉ (iteration_30, 100%) : audit code (2 destinataires seulement : MERCHANT_EMAIL constant + email du client), webhook SUCCESS e2e, logs vers commands@ uniquement, zéro 'bafatoumata', zéro fallback sandbox (domaine vérifié). Test pytest ajouté : /app/backend/tests/test_merchant_email_destination.py.
- REDÉPLOIEMENT REQUIS pour que la production ignore son ancienne env var.

## Update — Feb 2026 (SOLUTION FINALE retour Paxity : même onglet — iteration_31, 100%)
- Recherche : iframe IMPOSSIBLE (Orange Money renvoie x-frame-options: DENY ; Wave redirige vers paxity.io). 
- SOLUTION : paiement dans le MÊME onglet. Checkout.jsx : openPayWindow(url) = window.location.href (payWindowRef/closePayWindow/useRef supprimés — le mécanisme window.open+fermeture auto d'iteration_28 est OBSOLÈTE). PaymentReturnRedirect (App.js, existait déjà) ramène automatiquement le client sur /commande à tout chargement de page si sec_pending_paxity_tx_v1 existe (exclusions : /commande, /vendeur, /admin, /paiement).
- TESTÉ (iteration_31, 4/4) : clic → même onglet (0 nouvelle fenêtre) ; retour racine → redirection auto /commande ; webhook SUCCESS → écran confirmation ~4s + localStorage nettoyé ; pas de boucle après confirmation.
- Note review (non bloquante) : un payment_link same-origin boomerangerait vers /commande — en prod les liens sont toujours externes (pay.wave.com / sugu.orange-sonatel.com), pas de fix nécessaire.
- Script QA réutilisable : /app/scripts/seed_qa_tab.py

## Update — Feb 2026 (Emails « une fois pour toutes » — double destinataire marchand)
- email_service.py : MERCHANT_RECIPIENTS = ["commands@shoppingenchine.com", "Modou.ba.568@gmail.com"] (en dur) — la notification marchande part vers LES DEUX (filet si la boîte commands@ n'existe pas/spam). MERCHANT_EMAIL = premier de la liste (compat EMAIL_ENABLED).
- Test e2e immédiat (webhook SUCCESS) : logs → marchand envoyé aux 2 adresses (id 6de99b72) + client envoyé au Gmail (id e232d7ce). Le user doit VÉRIFIER SON GMAIL pour confirmer réception (« Nouvelle commande payée » + « Test définitif emails »).
- DIAGNOSTIC CLÉ : le pipeline PREVIEW est 100% fonctionnel (iterations 29/30 + ce test). Si rien n'arrive en PRODUCTION c'est que : (1) la prod n'a PAS été redéployée avec ce code, et/ou (2) l'env var RESEND_API_KEY du déploiement est ancienne/invalide (à vérifier dans les paramètres de déploiement Emergent). SENDER/MERCHANT en dur → plus dépendants des env vars.
- DNS réception : shoppingenchine.com a des MX (Proofpoint/Microsoft365 GoDaddy) → le domaine peut recevoir ; l'existence de la boîte commands@ reste à confirmer par le user (statut Delivered/Bounced dans resend.com → Emails).

## Update — Feb 2026 (Revue de code — correctifs appliqués, iteration_32 100%)
- APPLIQUÉ : products_router.py _process_images → MD5 remplacé par SHA-256 (hash 8 chars, versioning/cache-busting images). Testé : upload data-URL, thumb+full 200, anciens produits intacts (test pytest /app/backend/tests/test_product_images.py).
- FAUX POSITIFS écartés : tracking_router `dt.tzinfo is None` = idiome Python correct ; ComingSoon "API key" = simple mot de passe de gate soft (par design) ; document.write dans Orders.jsx = fenêtre d'impression contrôlée avec esc() (contenu échappé).
- BACKLOG REFACTORING (volontairement non appliqué — risque vs bénéfice sur app en prod, à faire lors d'un sprint dédié) :
  - Découper Checkout.jsx (784 l.), AddProduct.jsx (605 l.), Orders.jsx, Navbar.jsx en sous-composants
  - Extraire create_payin (complexité 42) et _extract_error_message en services
  - useMemo sur les values des 5 contextes (SellerContext, SellerAuthContext, CartContext, LocaleContext, CatalogContext)
  - Clés React stables au lieu d'index (11 endroits), catch vides à logger, deps useEffect manquantes (attention : les corriger peut créer des boucles — tester soigneusement)
  - Credentials de tests → fixtures .env.test

## Update — Feb 2026 (Revue de code P1+P2 appliquée — iteration_33, 100%)
- SÉCURITÉ (P1) :
  - XSS impression tickets : Orders.jsx printTickets → document.write SUPPRIMÉ, remplacé par Blob URL (URL.createObjectURL + window.open, contenu toujours échappé via esc()). Vérifié : onglet blob: s'ouvre avec tickets 100x150mm.
  - Gate « Bientôt disponible » : mot de passe déplacé vers frontend/.env → REACT_APP_SITE_PASSWORD=alarba2026 + REACT_APP_SITE_GATE_ENABLED=true (ComingSoon.jsx lit process.env ; gate désactivé si password absent). ATTENTION PROD : ajouter ces 2 env vars au déploiement.
  - Secrets tests Python : 5 fichiers de tests → import depuis tests/creds.py qui lit TEST_SELLER_EMAIL/TEST_SELLER_PASSWORD (ajoutés dans backend/.env).
  - Hooks React + `is` Python : vérifiés DÉJÀ propres (ESLint react-hooks exhaustive-deps 0 erreur sur tout src ; audit AST backend 0 comparaison `is` littérale). Directives eslint-disable obsolètes retirées (RetryOrder, PaymentSuccess).
- REFACTORING (P2) :
  - Checkout.jsx : 820 → ~535 lignes. Extraits dans src/components/checkout/ : AddressStep, PaymentMethodPicker, StripeCardPanel, PaxityPhoneForm, CheckoutSuccess, CheckoutPending, CheckoutSummary, operatorMeta.js. Polling PENDING_TX_KEY inchangé.
  - AddProduct.jsx : 640 → ~290 lignes. Extraits dans src/pages/seller/addproduct/ : GeneralInfoSection, PricingSection, PhotosSection, VariantsSection, ProductPreview, constants.js (SAMPLE_IMAGES, tailles, sortSizes).
  - paxity_router.py create_payin (198 l.) → helpers courts : _require_paxity_configured, _validate_payin, _persist_order, _build_payin_body, _parse_payin_response, _hydrate_tx_from_response, _mark_payin_failed, _finalize_payin. _extract_error_message simplifié via _first_str. Param BackgroundTasks inutilisé supprimé.
  - stripe_router.py create_stripe_checkout → _unit_amount_for, _build_stripe_lines, _create_stripe_session, _persist_stripe_order.
  - Clés React index → clés composites (OrderSummary, TrackOrder, seller/Orders items, SellerLayout liveEvents, ProductDetail gallery, DeliveryOptions, photos AddProduct).
  - Products.jsx : FiltersPanel (composant imbriqué re-monté à chaque rendu) → variable JSX filtersPanel.
  - Catch vide du polling Checkout → console.debug loggé.
- TESTS RÉPARÉS (assertions obsolètes, pas de régression réelle) : test_multicurrency_iter27 (32→19 USD, barème actuel), test_iter22 (image=images[0] par design ; Stripe embarqué = client_secret), test_stripe_iter20 (plus de seed p1, order_id séquentiel), test_email_service + test_merchant_email_destination (MERCHANT_EMAIL constante code).
- TESTÉ iteration_33 : 100% backend (91 pytest + curls) et 100% frontend (gate env, checkout 3 étapes multi-pays, Stripe embarqué chargé, AddProduct complet create/edit/delete, impression tickets blob, filtres boutique, tracking). data-testid ajoutés aux champs adresse (first-name-input, etc.).
- BACKLOG REFACTORING restant (optionnel) : useMemo sur les values des 5 contextes ; découpe Navbar.jsx / seller Orders.jsx si besoin.

## Update — Feb 2026 (RESET Resend + Journal des emails — testé e2e, statuts DELIVERED prouvés)
- User : « emails pas toujours reçus » → deep search : pipeline preview OK (Resend acceptait tout), mais clé restreinte à l'envoi = impossible de vérifier la livraison. User a demandé suppression de l'ancienne clé.
- NOUVELLE CLÉ RESEND (full access) fournie par le user et installée dans backend/.env (RESEND_API_KEY). Domaine shoppingenchine.com VÉRIFIÉ sur ce compte (vérifié par GET /domains).
- E2E prouvé : webhook Paxity SUCCESS → email marchand (commands@ + Modou.ba.568@gmail.com) = DELIVERED, email client = DELIVERED (statuts lus via API Resend).
- NOUVEAU : Journal des emails « une fois pour toutes » :
  - email_service._send_raw journalise CHAQUE tentative dans la collection email_log (tag, to, subject, resend_id, delivery_status, error).
  - /app/backend/emails_router.py : GET /api/emails/log (JWT vendeur, 401 sans token) avec rafraîchissement AUTO des statuts via API Resend (resend.Emails.get, tolérant 404 anciennes clés, abandon après 3 échecs si clé restreinte) ; POST /api/emails/resend-webhook (événements Resend delivered/bounced/complained, rang de statut anti-écrasement, insert si email inconnu).
  - Frontend : page /vendeur/emails (pages/seller/Emails.jsx) + lien nav « Emails » (SellerLayout) + route /admin/emails + emailsAPI.log() dans lib/api.js. Badges : Envoyé/Délivré ✓/Ouvert/Rejeté ✗/Marqué spam/Échec (raison affichée).
- PRODUCTION : au redéploiement, METTRE À JOUR l'env var RESEND_API_KEY du déploiement avec la nouvelle clé (re_d7vM...) sinon la prod continue avec l'ancienne clé morte.

## Update — Feb 2026 (destinataire commandes = commands@ uniquement)
- Root cause "commands@ ne reçoit rien" : emails DELIVERED au serveur mais retenus par Proofpoint/junk. User a ajouté le domaine shoppingenchine.com à l'Allow List GoDaddy Advanced Email Security → résolu.
- MERCHANT_RECIPIENTS réduit à ["commands@shoppingenchine.com"] (Modou.ba.568@gmail.com retiré à la demande du user). Testé : delivered ✓, 4 tests audit passent.
- ⚠️ REDEPLOY REQUIS pour appliquer en production (la prod envoie encore aux 2 adresses).

## Update — Feb 2026 (Retour automatique après paiement Paxity)
- Contexte : Paxity a confirmé au user que leur API ne redirige PAS vers le site marchand (doc officielle vérifiée : aucun paramètre returnUrl/redirect dans pay-in-mobile ; champs = amount, country, currency, phoneNumber, prefixPhone, paymentMethod, codeOtp, description, idClient, ipn).
- Solution implémentée côté site (Checkout.jsx) : « Payer maintenant » ouvre le lien Wave/OM dans un ONGLET SÉPARÉ (payWinRef) pendant que notre page reste en attente active (polling 2s inchangé). Dès confirmation (success/failed, via polling, manualCheck ou annulation), closePayWindow() ferme automatiquement l'onglet de paiement → le client revient sur notre confirmation. Repli même onglet si pop-up bloqué (restauration via PENDING_TX_KEY inchangée).
- TESTÉ e2e Playwright : onglet ouvert au clic (1→2), webhook SUCCESS → onglet fermé auto (2→1) + page confirmation affichée. SUCCÈS TOTAL.
- ⚠️ REDEPLOY requis pour appliquer en production.

## Update — Feb 2026 (Mobile : plus aucune nouvelle fenêtre au paiement)
- User : sur Android/iPhone, payer avec l'app Wave/OM ouvrait une nouvelle fenêtre → interdit désormais.
- Checkout.jsx openPayWindow : détection isMobileDevice (userAgent Android|iPhone|iPad|iPod).
  - MOBILE : window.location.href (même onglet, l'app s'ouvre par-dessus) — au retour, PaymentReturnRedirect (App.js) restaure la transaction en attente et le polling confirme.
  - DESKTOP : window.open + fermeture auto de l'onglet à la confirmation (payWinRef/closePayWindow).
- TESTÉ Playwright UA iPhone : clic Payer → 0 nouvel onglet, navigation même onglet ✓ ; retour sur le site → redirection auto /commande + écran d'attente restauré ✓ ; webhook SUCCESS → confirmation affichée ✓.
- ⚠️ REDEPLOY requis pour appliquer en production.

## Update — Feb 2026 (redirectUrl Paxity)
- Le support Paxity a confirmé au user l'existence de l'attribut `redirectUrl` (NON documenté publiquement) dans la requête PayIn.
- Ajouté dans _build_payin_body (paxity_router.py) : body["redirectUrl"] = {origin de la requête ou FRONTEND_URL}/commande. En prod → https://shoppingenchine.com/commande. Testé unitairement : le corps PayIn contient bien redirectUrl + ipn.
- Effet : après paiement sur la page Wave/OM/paxity, le client est redirigé par PAXITY vers notre page /commande (où PENDING_TX_KEY restaure la transaction et affiche la confirmation). Combiné avec : mobile = même onglet, desktop = onglet auto-fermé.
- ⚠️ REDEPLOY requis.

## Update — Feb 2026 (LANCEMENT : gate retiré)
- REACT_APP_SITE_GATE_ENABLED=false dans frontend/.env → l'écran « Bientôt disponible » ne s'affiche plus (testé visiteur neuf, localStorage vidé : accueil direct).
- Pour réactiver le gate un jour : remettre true (mot de passe toujours dans REACT_APP_SITE_PASSWORD).
- PROD : redeploy requis ; si l'écran persiste en prod, vérifier que la variable REACT_APP_SITE_GATE_ENABLED n'est pas forcée à true dans les env vars du déploiement.

## Update — Feb 2026 (BUG : confirmation → « Panier vide » après 1s — CORRIGÉ)
- Symptôme (prod, mobile) : après paiement, la page de confirmation s'affichait 1 seconde puis basculait sur « Panier vide ».
- ROOT CAUSE : App.js ligne 75 — <main key={pathname-lang-currency}> : quand la détection IP de locale se termine (~1s), lang/currency changent → la key change → React REMONTE toute la page → Checkout perd complete=true, le panier est déjà vidé et PENDING_TX_KEY supprimé → guard « Panier vide ».
- FIX double protection :
  1. App.js : la key de <main> exclut lang/currency sur /commande (pas de remontage pendant le checkout — protège aussi le formulaire d'adresse en cours de saisie).
  2. Checkout.jsx : confirmation persistée dans sessionStorage (COMPLETE_TX_KEY = sec_completed_paxity_tx_v1) — restaurée au montage SI panier vide ; supprimée si panier plein (nouvelle commande) et au démarrage d'un nouveau paiement (handlePayment/handleStripeCheckout).
- TESTÉ Playwright : confirmation stable après 9s ✓, survit à un rechargement complet ✓, nouvelle commande avec panier plein → formulaire normal + marqueur nettoyé ✓.
- ⚠️ REDEPLOY requis.

## Update — Feb 2026 (scroll haut de page entre les étapes du checkout)
- User (vidéo) : après « Continuer » sur mobile, la vue restait en bas de page (position du bouton) au lieu de montrer le haut de l'étape suivante.
- Fix : Checkout.jsx — useEffect window.scrollTo(0,0) sur [step, complete, transaction?.status] (placé APRÈS les déclarations de transaction/complete pour éviter une TDZ). Testé : passage étape 2 → scrollY≈0.
- ⚠️ REDEPLOY requis.

## Update — Feb 2026 (Poids retiré + Stripe désactivé au checkout)
- Fiche produit : ligne « Poids · 280 g » supprimée (ProductDetail.jsx onglet Caractéristiques).
- Paiement carte (Stripe) RETIRÉ du checkout à la demande du user : flag CARD_PAYMENT_ENABLED=false dans Checkout.jsx (repasser à true pour réactiver — tout le code Stripe backend+frontend est conservé). PaymentMethodPicker n'affiche le bouton Carte que si onSelectCard est fourni.
- Testé : bouton Carte absent, 5 méthodes mobile money intactes, checkout complet OK.
- NOTE : les clients Europe/USA n'ont plus d'option carte — mobile money uniquement.
- ⚠️ REDEPLOY requis.

## Update — Feb 2026 (Paiement CARTE via widget Paxity — remplace Stripe)
- Intégration du widget carte Paxity (https://saas.paxity.io/widget/card-widget.iife.js + style.css), doc https://paxity.io/documentation/widget.
- PIÈGES DÉCOUVERTS (doc publique inexacte, vérifié dans le code minifié du widget) :
  - window.PaxityWidget.open() attend `isOpen: true` AU NIVEAU RACINE (pas dans credentials)
  - credentials exige `apiKey` (K MAJUSCULE) + `apiToken` — la doc dit "apikey" (on passe les deux)
  - Props racine : {amount, currency, country, idClient, ipn, credentials, isOpen}
- Backend : POST /api/paxity/card/init (PaxityCardInitRequest) → crée commande+transaction pending, renvoie {order_id, transaction_id, amount, currency, country=SN, ipn, credentials}. Webhook corrigé : si transactionId Paxity inconnu → fallback sur idClient (order_id) + enregistre le paxity_transaction_id (fix critique pour le widget).
- Frontend : lib/paxityWidget.js (chargement paresseux ~4Mo), components/checkout/PaxityCardPanel.jsx, Checkout.handleCardPayment (init → setTransaction pending → PaxityWidget.open → IPN → polling → confirmation). CARD_PAYMENT_ENABLED=true. Code Stripe frontend retiré de Checkout (StripeEmbedded/stripeAPI/handleStripeCheckout supprimés) ; stripe_router backend + StripeCardPanel.jsx conservés.
- TESTÉ : curl card/init OK ; webhook idClient inconnu-txid → tx+order success ✓ ; e2e Playwright : modale widget affichée avec formulaire carte « Montant à payer : 9000 XOF » ✓ ; pending screen derrière ✓ ; 7 tests régression verts.
- NOTE : montant débité en XOF (les clients EU/US paient en XOF converti par leur banque).
- ⚠️ REDEPLOY requis.

## Update — Feb 2026 (livraison Express + couleur dans les commandes)
- BUG 1 : les commandes Paxity (mobile money + carte widget) affichaient toujours « Standard » — _persist_order (paxity_router) n'enregistrait pas delivery_mode (Stripe le faisait). FIX : "delivery_mode": payload.delivery_mode or "standard" dans _persist_order (couvre payin + card/init).
- BUG 2 : la couleur choisie par le client n'était jamais capturée. FIX chaîne complète :
  - CartContext : lineKey(id, size, color), addItem(product, qty, size, color), champ color stocké.
  - ProductDetail : handleAdd/handleBuyNow passent la couleur sélectionnée (hex).
  - Checkout : helper itemLabel(it) → « Nom — Taille M · Bleu » (via colorName de lib/colors) utilisé dans payin ET cardInit → visible partout (dashboard, tickets, emails).
  - Cart.jsx + CheckoutSummary : pastille + nom de couleur affichés.
- TESTÉ : card/init express → order.delivery_mode=express ✓ ; e2e produit coloré → panier « Size M · Bleu » + color en localStorage ✓. Produits/commandes QA nettoyés.
- ⚠️ REDEPLOY requis.

## Update — Feb 2026 (redirectUrl pour le paiement CARTE widget)
- User : après paiement carte, le retour ne revenait pas sur le site. Paxity : « renseigner redirectUrl dans le payload de l'endpoint de paiement ». PROBLÈME : le widget carte de Paxity n'envoie JAMAIS redirectUrl (mot absent de son code minifié ; body = holderName, number, expMonth, expYear, cvv, currency, amount, idClient, ipn).
- FIX : lib/paxityWidget.js — patchNetworkOnce() intercepte XMLHttpRequest + fetch et injecte redirectUrl dans toute requête vers */transaction/pay-in-car* (setCardRedirectUrl appelé par Checkout avec {origin}/commande).
- PROUVÉ par interception Playwright : le payload sortant du widget contient bien redirectUrl (requête bloquée, aucun paiement réel). Filet de sécurité conservé : restauration PENDING_TX_KEY si le client revient manuellement.
- ⚠️ REDEPLOY requis + test carte réel par le user en prod.

## Update — Feb 2026 (numéros de commande consécutifs — attribués au paiement confirmé)
- User : numéros non alignés (#1219, #1207, #1204…) car un numéro était consommé à CHAQUE tentative de checkout (paiements abandonnés inclus).
- FIX (paxity_router.py) : les commandes sont créées avec un id temporaire tmp_{uuid10}. Le compteur next_order_number n'est consommé QUE lors de la confirmation du paiement via _finalize_order_number(db, order_id) — idempotent (webhooks dupliqués : champ tmp_id conservé pour relire le numéro final).
- Points de finalisation : webhook (SUCCESS), _refresh_pending_tx (polling client + watcher serveur), _finalize_payin (succès immédiat OM/OTP). Les paxity_transactions.order_id sont renommées en même temps ; le polling /paxity/status renvoie le numéro FINAL au client.
- Frontend : orderNo() affiche "—" pour les ids tmp_ (tentatives non payées dans le dashboard vendeur).
- TESTÉ : 2 tentatives → tmp ; paiements confirmés → 1053 puis 1054 consécutifs ✓ ; polling client renvoie le numéro final ✓ ; tests régression verts.
- NOTE : les trous EXISTANTS en prod (#1188→#1204) ne peuvent pas être comblés rétroactivement ; les nouvelles commandes payées seront consécutives.
- ⚠️ REDEPLOY requis.

## Update — Feb 2026 (charset e-ticket + re-vérification redirection)
- BUG e-ticket : accents cassés (aoÃ»t, SÃ©nÃ©gal) — le HTML du ticket Blob n'avait PAS de <meta charset="utf-8"> et le Blob était type text/html sans charset → interprété Latin-1. FIX : meta charset + Blob "text/html;charset=utf-8" (Orders.jsx).
- Redirection → confirmation RE-VÉRIFIÉE e2e en preview : webhook success + arrivée sur /commande (avec query params) → « Your order is confirmed » + numéro final #1056, accents OK, stable 10s. LE CODE EST BON — le user observe l'ancien comportement en PRODUCTION car le redeploy n'a pas encore été fait avec ces correctifs.

## Update — Feb 2026 (Gestion du stock produit)
- User : « Sur le dashboard ajouter produit add number de stock et option en rupture de stock ».
- Backend (products_router.py) : ProductPayload += stock (Optional[int] ≥ 0, None = illimité) et outOfStock (bool, défaut False). Persisté sur POST/PUT, renvoyé dans la liste publique et la fiche.
- Formulaire vendeur : nouvelle section « Stock » (addproduct/StockSection.jsx) — input quantité (data-testid=stock-input) + switch « En rupture de stock » (data-testid=out-of-stock-switch), pré-remplissage en mode édition.
- Boutique : soldOut = outOfStock === true || stock === 0. ProductCard → badge rouge « Rupture de stock » + bouton désactivé. ProductDetail → bandeau (data-testid=sold-out-notice), boutons Ajouter/Acheter désactivés, lien « Acheter maintenant » masqué. Traductions EN ajoutées (locale.js).
- Dashboard liste produits (Products.jsx) : sous le prix → « Stock : N » ou « Rupture de stock » en rouge (data-testid=stock-status-{id}).
- NOTE : pas de décrément automatique du stock à la commande (non demandé) — gestion manuelle par le vendeur.
- TESTÉ : API create/get/list OK (stock persisté), screenshot fiche produit stock=0 → bandeau + bouton « Out of stock » désactivé ✓, formulaire vendeur affiche la section Stock ✓. Produit de test supprimé.
- ⚠️ REDEPLOY requis pour la production.

## Update — Feb 2026 (les commandes de TEST ne consomment plus de vrais numéros)
- User (screenshot emails) : #1057/#1058 (tests preview) mélangés avec #1254 (vraie commande prod) dans la boîte mail → « ne donne plus jamais de numéros de commande aux tests ».
- CAUSE : preview et production ont chacune leur compteur ; les 2 environnements envoient les emails à la même boîte marchand.
- FIX : détection d'environnement au moment de la création de commande — _is_test_env(request) (paxity_router.py) : host x-forwarded-host contient .preview.emergentagent.com ou localhost/127. → order.is_test=True (payin mobile ET card/init).
- _finalize_order_number : si order.is_test → next_test_order_number (orders_router.py, compteur séparé db.counters _id=test_order_number) → TEST-101, TEST-102… Le VRAI compteur (order_number) n'est jamais touché par les tests.
- Emails (email_service.py) : _test_tag(order) préfixe « [TEST] » les sujets (marchand, client, relance panier, suivi) pour toute commande is_test / TEST-xxx / tmp_. _order_no affiche #TEST-101.
- Frontend utils.js orderNo() : TEST-xxx → « #TEST-101 » (dashboard vendeur).
- TESTÉ e2e preview : webhook succès sur commande is_test → id TEST-101, compteur réel inchangé (59), email « [TEST] Nouvelle commande payée — #TEST-101 » ✓ ; commande prod-like (sans flag) → #1059 séquentiel, email normal ✓. Régression : 31 tests verts + nouveau tests/test_test_order_numbers.py (5 verts).
- ⚠️ REDEPLOY requis (sans effet visible en prod : shoppingenchine.com n'est jamais détecté comme test).

## Update — Feb 2026 (Corrections sécurité : XSS e-tickets + hooks React)
- Orders.jsx : document.write avait déjà été remplacé (Blob URL + esc()) lors du fix UTF-8 ; durci it.qty via Number(it.qty)||1 → plus aucune interpolation non échappée dans le HTML du ticket.
- CartContext.jsx : addItem/removeItem/updateQty/clear mémoïsés en useCallback (identités stables) — cause racine des deps manquantes.
- PaymentSuccess.jsx : deps [sessionId, clear] ; RetryOrder.jsx : deps [orderId, addItem, clear, navigate, products] (garde ran.current). Checkout.jsx était déjà conforme (audit eslint react-hooks/exhaustive-deps : 0 warning sur tout src/).
- data-testid ajoutés (remarques agent de test) : cart-remove-{line}, cart-clear-btn, cart-checkout-btn, paxity-method-btn-{code}.
- TESTÉ : testing agent iteration_34.json — 100% frontend, 0 erreur console. Panier (ajout 2 sources, +/- qty, suppression, vidage), checkout 3 étapes (arrêt avant paiement réel), impression tickets vendeur (blob HTML inspecté : 0 <script>, nom client échappé), rupture de stock OK.
- Reste au backlog refactoring : découpage des grosses fonctions de paxity_router.py (non demandé explicitement).
- ⚠️ REDEPLOY requis pour la production.

## Update — Feb 2026 (Rapport qualité de code appliqué — backend)
- « Variable non définie » : aucune en production (pyflakes) ; c'était la variable inutilisée `before` dans test_email_fallback.py → supprimée. tracking_router.py:58 est un `is None` idiomatique (acceptable selon la note du rapport) → inchangé.
- paxity_router.py refactoré : _extract_error_message → stratégie mapping (_msg_from_value + _STATUS_FALLBACK_MSG) ; create_payin → _new_payin_tx / _raise_payin_upstream_errors / _payin_response (~35 lignes) ; paxity_webhook → _parse_webhook_ids / _match_webhook_tx / _handle_payment_success / _handle_status_change ; diagnostic → _diag_base_result / _diag_check_dns / _diag_probe_http. Comportement identique.
- emails_router.resend_webhook → _should_skip_downgrade / _build_status_update / _upsert_email_log.
- email_service : _items_rows_html + _customer_block_html (templates partagés marchand/client) ; maybe_send_customer_confirmation scindé en _claim_customer_email (décision atomique) + _customer_confirmation_html (template) + envoi.
- products_router._process_images → _image_sources + _prune_orphan_images.
- stripe_router : dataclass StripeOrderData (8 params → 3) sur _persist_stripe_order.
- Tests : test_product_images.py réécrit en 7 petits tests avec fixtures pytest ; `is True/False` → `== True/False` dans tous les tests ; imports/variables inutilisés supprimés ; type hints de retour ajoutés à 19 signatures de routers.
- NOUVEAU tests/conftest.py : fixture require_stripe → les 6 tests Stripe sont SKIPPÉS avec raison claire tant que le compte Stripe live refuse les charges ("Your account cannot currently make live charges") — Stripe est retiré du checkout (Paxity actif). Ils se réactiveront seuls si Stripe redevient opérationnel.
- test_email_fallback.test_webhook_idempotent rendu robuste au parallélisme xdist (compte email_log par sujet de commande au lieu du log supervisor partagé).
- TESTÉ : suite complète 95 verts / 0 échec / 7 skips ; pyflakes 0 ; endpoints externes products/config/webhook = 200 ; diagnostic Paxity OK (dns+http+auth 200).
- ⚠️ REDEPLOY requis pour la production.

## Update — Feb 2026 (Couleur obligatoire + affichage couleurs dans les commandes)
- User : les couleurs ne s'affichent pas dans les commandes du Dashboard ; le choix de couleur ne doit pas être optionnel ; les nouvelles commandes doivent montrer la couleur choisie.
- CAUSES : (1) PaxityOrderItem (backend) ne stockait pas color/size structurés, (2) SellerContext.mapOrder supprimait ces champs, (3) ProductCard permettait l'ajout rapide sans couleur, (4) ProductDetail pré-sélectionnait silencieusement la 1re couleur.
- FIX backend : PaxityOrderItem += color (hex) + size (Optional) — s'applique au payin mobile ET au card/init.
- FIX Checkout.jsx : items payload += color/size structurés (le nom garde aussi le libellé « — Taille M · Rouge »).
- FIX ProductDetail.jsx : couleur OBLIGATOIRE — useState(null) (plus de pré-sélection), requireColor() bloque Ajouter/Acheter avec toast + scroll vers le sélecteur, hint rouge « choisissez une couleur * » (data-testid=color-required-hint).
- FIX ProductCard.jsx : produit avec couleurs → le bouton devient « Choisir la couleur » et ouvre la fiche produit (pas d'ajout direct sans couleur).
- FIX Dashboard : SellerContext.mapOrder transmet color/size ; Orders.jsx dialog affiche pastille couleur + nom (colorName) + taille (data-testid=order-item-variant-{i}), fallback sur le suffixe du nom pour les anciennes commandes ; ticket imprimé utilise les champs structurés en priorité.
- BONUS : RetryOrder.jsx restaure aussi color/size dans le panier.
- Traductions EN ajoutées (Choose a color, Please choose a color…).
- TESTÉ : card/init persiste color/size ✓, webhook → TEST-102 ✓, dialog Dashboard affiche « Qté 1 · Taille M · 🔴 Rouge » (screenshot) ✓, fiche produit bloque sans couleur (toast) ✓, carte boutique « Choose a color » ✓. Régression pytest verte. Données de test nettoyées.
- ⚠️ REDEPLOY requis pour la production.

## Update — Feb 2026 (E-ticket : modèle photo + correctif DÉFINITIF caractères illisibles)
- User (photo d'un ticket imprimé) : « utilise ce modèle pour le e-ticket et plus jamais de &$):)/ (caractères illisibles), règle ça pour de bon ».
- CORRECTIF DÉFINITIF mojibake : esc() (Orders.jsx) convertit désormais TOUT caractère non-ASCII (é, à, û, ·, –…) en entité HTML numérique (&#233;…). Tous les textes statiques du template (Expédier à, Quantité, jours ouvrés, réglages d'impression) sont écrits en entités ; commentaires CSS ASCII-ifiés. => Le document d'impression est 100 % ASCII : l'encodage ne peut plus se casser quel que soit le navigateur/pilote (meta charset + blob charset conservés en plus).
- Modèle photo restauré : encadré noir autour de « Livraison : STANDARD/EXPRESS (…) » (.ship avec border + align-self:flex-start), en-têtes « ARTICLES / QUANTITÉ » sans compteur. Le reste (marque + n°/date, colonnes EXPÉDIER À/FACTURER À, « 1 sur 1 », pied Merci pour votre achat/Guangzhou) était déjà conforme.
- Les 2 boutons d'impression (bulk + dialog) passent par le même printTickets → un seul template.
- TESTÉ : popup Blob ouvert via Playwright sur commande #1057 — screenshot du ticket conforme à la photo, texte « 14 août 2026, EXPÉDIER À, QUANTITÉ, OUVRÉS » parfait, source ASCII pur.
- ⚠️ CRITIQUE : le user voit encore les caractères illisibles en PRODUCTION car elle tourne avec l'ancien code → REDEPLOY OBLIGATOIRE.
