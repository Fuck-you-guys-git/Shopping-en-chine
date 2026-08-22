# ROADMAP — Shopping en Chine

## P0 — En attente de validation user (REDEPLOY nécessaire)
- Multi-devises Paxity (EUR/USD) : code terminé + testé backend. À VALIDER EN PRODUCTION par le user après REDEPLOY (vrai paiement carte EUR).

## P0 — Refonte UI/UX en cours (livraison par lots)
- LOT 1 ✅ LIVRÉ (Juin 2026) : design system, header/nav/recherche, footer, homepage. EN ATTENTE DE VALIDATION USER.
- LOT 2 (à faire) : page catalogue (drawer filtres mobile, filtres couleur/taille/dispo/promo si données réelles, tri complet) + fiche produit premium (galerie + zoom, variantes claires, onglets Description/Caractéristiques/Livraison/Retours/Avis, recommandations « Vous pourriez aussi aimer » et « Produits similaires »).
- LOT 3 (à faire) : panier (mini-cart affiné, empty state), checkout (4 étapes claires, récap sous-total/livraison/réduction/total, aucun moyen de paiement non disponible affiché), pages d'erreur 404 / produit introuvable, SEO (breadcrumbs, données structurées, sitemap, robots), audit performance + accessibilité + responsive final.

## P1
- Traduction automatique des noms/descriptions produits en anglais pour clients USA/Canada (locale EN).
- Comptes clients + Favoris (retirés du header au Lot 1 faute d'auth client — à construire si le user le souhaite).

## P2
- Export des commandes en Excel/CSV depuis le dashboard vendeur.
- Toggle produit Actif/Masqué (mode brouillon).
- Avis clients vérifiés (achat confirmé).

## Notes
- Stripe : intégré mais déconnecté dans l'UI (clé user requise).
- Tests flakys connus (exécution parallèle xdist uniquement, passent en isolé) : test_email_fallback::test_webhook_idempotent, test_paxity_diagnostic_preview::test_payin_unknown_method_returns_400.

## Fait (Fév 2026, cette session)
- Multi-devises Paxity EUR/USD (débit direct, amount_xof pour stats).
- Bouton carte = prix affiché (plus de conversion sur l'étiquette).
- SUPPRESSION totale de la conversion automatique (prix vendeur EUR/USD obligatoires).
