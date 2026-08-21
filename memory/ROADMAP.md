# ROADMAP — Shopping en Chine

## P0 — En attente de validation user
- Multi-devises Paxity (EUR/USD) : code terminé + testé backend. À VALIDER EN PRODUCTION par le user après REDEPLOY (vrai paiement carte EUR).

## P1
- Traduction automatique des noms/descriptions produits en anglais pour clients USA/Canada (locale EN).

## P2
- Export des commandes en Excel/CSV depuis le dashboard vendeur.
- Toggle produit Actif/Masqué (mode brouillon).
- Avis clients vérifiés (achat confirmé).

## Notes
- Stripe : intégré mais déconnecté dans l'UI (clé user requise).
- Tests flakys connus (exécution parallèle xdist uniquement, passent en isolé) : test_email_fallback::test_webhook_idempotent, test_paxity_diagnostic_preview::test_payin_unknown_method_returns_400.
