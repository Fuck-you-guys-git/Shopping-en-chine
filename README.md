# Shopping en Chine

Boutique en ligne — catalogue, panier, commande en 3 étapes et espace vendeur.
React (CRA + craco, Tailwind, shadcn/ui) côté frontend, FastAPI + MongoDB côté backend.

## Démarrer sur votre PC

Voir **[DEMARRAGE-PC.md](DEMARRAGE-PC.md)** — ou, sous Windows, double-cliquez sur `start-pc.bat`.

## Structure

- `frontend/` — application React. Port 3000. Lit `REACT_APP_BACKEND_URL` pour joindre l'API.
- `backend/` — API FastAPI, routes sous `/api`, port 8001 :
  - `catalog.py` — produits (`GET /api/products`). Les prix de départ sont dans `data/products.json`
    et sont copiés dans MongoDB au démarrage (un produit déjà en base n'est jamais écrasé).
  - `orders.py` — commandes (`POST /api/orders`). Le serveur calcule lui-même prix, livraison et total.
  - `payments.py` — configuration du paiement (`GET /api/payments/config`) et retour du widget Paxity.
  - `money.py` — devises : F CFA, € (taux fixe légal) et $ (taux choisi, à modifier ici).
- `backend/tests/` — tests pytest de l'API (base en mémoire via `mongomock-motor`, pas de serveur MongoDB requis).

## Configuration

Copiez `backend/.env.example` → `backend/.env` et `frontend/.env.example` → `frontend/.env`,
puis adaptez les valeurs. Les fichiers `.env` ne sont jamais commités.

## Paiement

| Moyen | Devise | Traité par |
|---|---|---|
| Wave / Orange Money | F CFA | widget Paxity v2 |
| Carte bancaire | € ou $ | widget Paxity v2 (onglet carte) |
| Paiement à la livraison | F CFA | — |

Le paiement en ligne s'active en renseignant `PAXITY_ORG_ID` dans `backend/.env`. Les montants envoyés
à Paxity sont calculés par le serveur (`amount_minor` : F CFA × 100, centimes pour € et $).

⚠️ Le signal « paiement réussi » du widget vient du navigateur du client et peut être falsifié : une
commande payée en ligne passe en « paiement à vérifier ». Vérifiez-la dans le tableau de bord Paxity avant
d'expédier, jusqu'à ce que la vérification côté serveur (webhook Paxity) soit branchée.
