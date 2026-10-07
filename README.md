# Shopping en Chine

Boutique en ligne — catalogue, panier, commande en 3 étapes et espace vendeur.
React (CRA + craco, Tailwind, shadcn/ui) côté frontend, FastAPI + MongoDB côté backend.

## Démarrer sur votre PC

Voir **[DEMARRAGE-PC.md](DEMARRAGE-PC.md)** — ou, sous Windows, double-cliquez sur `start-pc.bat`.

## Structure

- `frontend/` — application React. Port 3000. Lit `REACT_APP_BACKEND_URL` pour joindre l'API.
- `backend/` — API FastAPI (`server.py`), MongoDB via motor. Port 8001, routes sous `/api`.
- `backend/tests/` — tests pytest de l'API (base en mémoire via `mongomock-motor`, pas de serveur MongoDB requis).

## Configuration

Copiez `backend/.env.example` → `backend/.env` et `frontend/.env.example` → `frontend/.env`,
puis adaptez les valeurs. Les fichiers `.env` ne sont jamais commités.

## Paiement

Aucun prestataire de paiement n'est intégré pour le moment : une commande est enregistrée via
`POST /api/orders` avec « paiement à la livraison ». L'intégration Paxity v2 sera ajoutée séparément.
