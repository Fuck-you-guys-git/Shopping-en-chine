"""Identifiants de test chargés depuis l'environnement — aucun secret en dur.

Source : variables d'environnement TEST_SELLER_EMAIL / TEST_SELLER_PASSWORD,
avec repli sur /app/backend/.env (non versionné en production).
"""
import os

from dotenv import dotenv_values

_env = {**dotenv_values("/app/backend/.env"), **os.environ}

SELLER_EMAIL = _env.get("TEST_SELLER_EMAIL", "")
SELLER_PASSWORD = _env.get("TEST_SELLER_PASSWORD", "")
