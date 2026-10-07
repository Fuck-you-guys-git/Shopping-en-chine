# Démarrer « Shopping en Chine » sur votre PC

Le site tourne en local avec trois morceaux : le **frontend** React (la fenêtre que vous voyez,
port 3000), le **backend** FastAPI (l'API, port 8001) et une base **MongoDB** (où les commandes
sont enregistrées).

## 1. À installer une seule fois (Windows)

| Outil | Où | Remarque |
|---|---|---|
| Git | https://git-scm.com/download/win | options par défaut |
| Node.js LTS (20 ou plus) | https://nodejs.org | options par défaut |
| Python 3.11 ou plus | https://www.python.org/downloads/ | **cochez « Add python.exe to PATH »** |
| MongoDB Community Server | https://www.mongodb.com/try/download/community | laissez « Install as a Windows service » coché |

Pas envie d'installer MongoDB ? Créez un cluster gratuit sur https://www.mongodb.com/atlas et collez
son URL de connexion dans `backend/.env` (variable `MONGO_URL`).

## 2. Récupérer le projet

```bat
git clone https://github.com/fuck-you-guys-git/shopping-en-chine.git
cd shopping-en-chine
```

Si cette version n'est pas encore fusionnée dans la branche principale :

```bat
git checkout claude/show-window-pc-x8u956
```

## 3. Lancer (le plus simple)

Double-cliquez sur **`start-pc.bat`** à la racine du projet. Le script :

1. vérifie Python / Node / yarn ;
2. crée `backend/.env` et `frontend/.env` à partir des fichiers `.env.example` s'ils n'existent pas ;
3. installe les dépendances (la première fois : quelques minutes) ;
4. ouvre deux fenêtres — backend (port 8001) et frontend (port 3000).

Le site s'ouvre ensuite tout seul dans votre navigateur : **http://localhost:3000**.
Pour arrêter : fermez les deux fenêtres.

## 4. À la main (ou sur Mac / Linux)

Backend — dans un premier terminal :

```bat
cd backend
python -m venv venv
venv\Scripts\activate            :: Mac/Linux : source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env           :: Mac/Linux : cp .env.example .env
uvicorn server:app --reload --port 8001
```

Frontend — dans un second terminal :

```bat
cd frontend
copy .env.example .env           :: Mac/Linux : cp .env.example .env
yarn install                     :: si yarn manque : npm install -g yarn
yarn start
```

- Site : http://localhost:3000
- API : http://localhost:8001/api/ — documentation interactive : http://localhost:8001/docs

## 5. Tests du backend

```bat
cd backend
venv\Scripts\activate
pytest
```

Les tests n'ont pas besoin de MongoDB (base en mémoire via `mongomock-motor`).

## 6. Problèmes fréquents

- **« python n'est pas reconnu »** — réinstallez Python en cochant « Add python.exe to PATH »,
  ou remplacez `python` par `py` dans les commandes.
- **Port 3000 ou 8001 déjà utilisé** — fermez le programme qui l'occupe, ou changez `PORT` dans
  `frontend/.env` / `--port` du backend (et `REACT_APP_BACKEND_URL` en conséquence).
- **« Impossible d'enregistrer la commande » dans le site** — le backend n'est pas démarré, ou
  MongoDB ne tourne pas (Services Windows → « MongoDB » → Démarrer).
- **Erreur réseau (`ECONNRESET`) pendant `yarn install`** — relancez simplement la commande.

## Paiement

Aucun prestataire de paiement n'est intégré pour l'instant : la commande est enregistrée avec
« paiement à la livraison ». L'intégration Paxity (v2) sera ajoutée séparément à partir de la nouvelle
documentation — les clés iront dans `backend/.env`, jamais dans le code ni dans le frontend.
