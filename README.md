# Shopping en Chine

Boutique en ligne (React + FastAPI + MongoDB), développée sur Emergent et déployable sur Railway.

## Déployer sur Railway

Railway détecte `Dockerfile` et `railway.json` à la racine : **un seul service** construit le site React
et le sert avec l'API (`/api`), sur la même adresse. Chaque push sur `main` redéploie ; le service n'est
mis en ligne que si `/api/` répond (un déploiement raté ne remplace pas la version en ligne).

Une seule fois dans Railway :
1. **+ New → Database → MongoDB**.
2. Service du site → **Settings → Source** : Root Directory **vide**, branche **main**.
3. Service du site → **Variables** :

| Variable | Valeur |
|---|---|
| `MONGO_URL` | `${{MongoDB.MONGO_URL}}` |
| `DB_NAME` | `shopping_en_chine` (obligatoire) |
| `JWT_SECRET` | une longue chaîne aléatoire (sessions vendeur) |
| `SELLER_EMAIL` / `SELLER_PASSWORD` | connexion à l'espace vendeur (`/admin`) |
| `PAXITY_V2_API_KEY` | clé Paxity `pax_live_…` (jamais dans un fichier du dépôt) |
| `PAXITY_V2_ORG_ID` | identifiant d'organisation Paxity |
| `RESEND_API_KEY` | envoi des emails (confirmations, relances) |
| `MERCHANT_EMAIL` | adresse qui reçoit les alertes de commande |
| `FRONTEND_URL` | `https://www.shoppingenchine.com` (liens dans les emails) |
| `CORS_ORIGINS` | `https://www.shoppingenchine.com` |
| `REACT_APP_SITE_GATE_ENABLED` / `REACT_APP_SITE_PASSWORD` | page « bientôt disponible » (optionnel) |

Facultatif : `PAXITY_V2_BASE_URL` (défaut `https://api-v2.paxity.io`), `PAXITY_IPN_URL` (défaut : déduit
de l'adresse du site).

Une base neuve démarre **sans produits ni commandes** : pour reprendre les données d'Emergent, exportez
la base Emergent (`mongodump`) puis importez-la dans MongoDB Railway (`mongorestore` avec `MONGO_PUBLIC_URL`).
