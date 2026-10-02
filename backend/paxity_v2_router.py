"""
Paxity v2 — création de session de paiement (checkout-v2 / merchant-v2).

POST /api/paxity/v2/checkout  -> crée la commande + la transaction Paxity v2
GET  /api/paxity/v2/config    -> dit au frontend si la v2 est activée

Différences avec la v1 (`paxity_router.py`, toujours en service) :
- Authentification par en-tête `X-Api-Key` (secret `pax_test_…` / `pax_live_…`)
  + `organizationId` + `X-Paxity-Env` (test | live).
- `Idempotency-Key` fournie par nous : aucun risque de double débit si la
  requête est rejouée (réseau instable côté client).
- Le montant est exprimé en **plus petite unité** (`amount_minor`).
- Notre n° de commande voyage dans `metadata.order_id`, et `callback_url`
  reçoit la notification serveur → la confirmation (et donc les emails) ne
  dépend JAMAIS du navigateur du client.

INTERRUPTEUR : sans `PAXITY_V2_API_KEY` dans le .env, la v2 est désactivée et
le site continue d'encaisser avec la v1. Rien à redéployer pour basculer.
"""
from __future__ import annotations

import logging
import os
import uuid

import httpx
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/paxity/v2", tags=["paxity-v2"])

V2_BASE_URL = os.environ.get("PAXITY_V2_BASE_URL", "https://merchant-v2.paxity.io")
V2_API_KEY = os.environ.get("PAXITY_V2_API_KEY", "")
V2_ORG_ID = os.environ.get("PAXITY_V2_ORG_ID", "")
V2_ENV = os.environ.get("PAXITY_V2_ENV", "test")
V2_ENABLED = bool(V2_API_KEY and V2_ORG_ID)

# Devises sans décimale : le montant mineur est le montant lui-même.
ZERO_DECIMAL = {"XOF", "XAF", "GNF", "JPY", "KRW", "CLP", "VND"}


def to_amount_minor(amount: float, currency: str) -> int:
    """25 000 XOF -> 25000 ; 45,99 EUR -> 4599 (centimes)."""
    cur = (currency or "XOF").upper()
    return int(round(float(amount))) if cur in ZERO_DECIMAL else int(round(float(amount) * 100))


def _headers(idempotency_key: str) -> dict:
    return {
        "X-Api-Key": V2_API_KEY,
        "X-Paxity-Env": V2_ENV,
        "organizationId": V2_ORG_ID,
        "Idempotency-Key": idempotency_key,
        "Content-Type": "application/json",
    }


def _callback_url(request: Request) -> str:
    """URL de notification serveur : le webhook v1 existant, qui sait déjà
    retrouver la commande (il lit aussi `metadata.order_id` pour la v2)."""
    explicit = os.environ.get("PAXITY_IPN_URL", "")
    if explicit:
        return explicit
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    if not host or host.startswith(("localhost", "127.", "10.", "192.168.")):
        return ""
    proto = (request.headers.get("x-forwarded-proto") or "https").split(",")[0].strip()
    return f"{proto}://{host}/api/paxity/webhook"


@router.get("/config")
async def v2_config() -> dict:
    """Le frontend n'affiche le parcours v2 que si `enabled` est vrai."""
    return {
        "enabled": V2_ENABLED,
        "org_id": V2_ORG_ID if V2_ENABLED else "",
        "env": V2_ENV,
        "base_url": V2_BASE_URL,
    }


def build_transaction_body(*, amount: float, currency: str, method: str, country: str | None,
                           phone: str, email: str, description: str, order_id: str,
                           callback_url: str) -> dict:
    """Corps exact attendu par POST /v2/external/transactions."""
    body = {
        "currency": (currency or "XOF").upper(),
        "method": method,
        "country": country,
        "customer": {"phone": phone, "email": email},
        "description": description,
        "metadata": {"order_id": order_id},
        "amount_minor": to_amount_minor(amount, currency),
    }
    if callback_url:
        body["callback_url"] = callback_url
    return {k: v for k, v in body.items() if v is not None}


async def create_transaction(body: dict, idempotency_key: str) -> tuple[int, dict]:
    """Appelle Paxity v2. Renvoie (status_code, payload décodé)."""
    url = f"{V2_BASE_URL.rstrip('/')}/v2/external/transactions"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, json=body, headers=_headers(idempotency_key))
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text[:500]}


@router.post("/checkout")
async def v2_checkout(payload: dict, request: Request) -> dict:
    """Crée la transaction Paxity v2 pour une commande déjà enregistrée.

    `payload` : {order_id, amount, currency, method, country, phone, email, description}
    La commande doit avoir été créée au préalable (id `tmp_xxx`) : on ne
    consomme un numéro séquentiel qu'au paiement confirmé.
    """
    if not V2_ENABLED:
        raise HTTPException(status_code=503, detail="Paxity v2 n'est pas activé sur ce site.")

    order_id = str(payload.get("order_id") or "").strip()
    if not order_id:
        raise HTTPException(status_code=400, detail="order_id manquant")
    try:
        amount = float(payload.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")

    db = request.app.state.db
    order = await db.orders.find_one({"id": order_id}, {"_id": 0, "id": 1})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")

    body = build_transaction_body(
        amount=amount,
        currency=payload.get("currency") or "XOF",
        method=str(payload.get("method") or "CARD").upper(),
        country=payload.get("country"),
        phone=str(payload.get("phone") or ""),
        email=str(payload.get("email") or ""),
        description=str(payload.get("description") or f"Commande {order_id}"),
        order_id=order_id,
        callback_url=_callback_url(request),
    )
    # Clé d'idempotence stable par commande : un rejeu ne crée pas un 2e débit
    idempotency_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"paxity-v2:{order_id}"))

    status_code, data = await create_transaction(body, idempotency_key)
    if status_code >= 400:
        logger.error(f"[PaxityV2] Création refusée ({status_code}) order={order_id} resp={data}")
        raise HTTPException(status_code=502, detail="Paxity a refusé la création du paiement.")

    await db.paxity_v2_sessions.update_one(
        {"order_id": order_id},
        {"$set": {"order_id": order_id, "request": body, "response": data}},
        upsert=True,
    )
    logger.info(f"[PaxityV2] Transaction créée order={order_id} method={body['method']}")
    return {"order_id": order_id, "paxity": data}
