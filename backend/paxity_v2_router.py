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

V2_BASE_URL = os.environ.get("PAXITY_V2_BASE_URL", "https://api-v2.paxity.io")
V2_API_KEY = os.environ.get("PAXITY_V2_API_KEY", "").strip()
V2_ORG_ID = os.environ.get(
    # Identifiant d'organisation « SHOPPING EN CHINE » confirmé par le marchand.
    # Ce n'est pas un secret (il est visible dans son portail Paxity) : le mettre
    # par défaut évite d'avoir à déclarer un secret de plus en production, donc
    # une faute de frappe qui laisserait la v2 silencieusement éteinte.
    "PAXITY_V2_ORG_ID", "67bb94e8-5373-4dd5-b125-9ec83e409cff",
)


def _resolve_env(key: str) -> str:
    """L'environnement est DÉDUIT du préfixe de la clé, pas configuré à la main.

    Les clés Paxity sont liées à leur environnement : une `pax_test_` ne
    fonctionne qu'en `test`, une `pax_live_` qu'en `live`. Déduire évite deux
    erreurs coûteuses : clé live envoyée en `test` (paiements refusés) et clé
    test envoyée en `live` (on croit encaisser alors que rien n'est débité).
    """
    if key.startswith("pax_live_"):
        return "live"
    if key.startswith("pax_test_"):
        return "test"
    return os.environ.get("PAXITY_V2_ENV", "test")


V2_ENV = _resolve_env(V2_API_KEY)
V2_ENABLED = bool(V2_API_KEY and V2_ORG_ID)

# Devises sans décimale : le montant mineur est le montant lui-même.
ZERO_DECIMAL = {"XOF", "XAF", "GNF", "JPY", "KRW", "CLP", "VND"}

# Contraintes mesurées sur l'API v2 réelle (clé de test, octobre 2026).
# L'API refuse tout pays hors de cette liste, et impose la devise locale :
# « currency EUR does not match country SN (expected XOF) ».
# Conséquence : la v2 ne peut PAS encaisser les clients Europe/USA en EUR/USD,
# qui doivent continuer à passer par la v1. Ne pas « corriger » cette liste
# sans l'avoir revérifiée auprès de l'API.
V2_COUNTRIES = {"SN", "CI", "ML", "BF", "NE", "TG", "BJ", "CM", "GH", "NG", "KE"}
V2_METHODS = {
    "WAVE", "ORANGE_MONEY", "MTN_MOMO", "MOOV_MONEY", "FREE_MONEY", "T_MONEY",
    "AT", "TELCEL", "OPAY", "MPESA", "CARD", "GIM_UEMOA", "RTGS",
}
V2_CURRENCIES = {"XOF", "XAF", "GHS", "NGN", "KES"}

# Codes v1 (spécifiques au pays) -> (méthode v2, pays). Attention : l'API v2
# refuse « OM » et « MTN », il faut ORANGE_MONEY et MTN_MOMO.
V1_TO_V2 = {
    "OMSN": ("ORANGE_MONEY", "SN"),
    "OMCI": ("ORANGE_MONEY", "CI"),
    "WAVESN": ("WAVE", "SN"),
    "WAVECI": ("WAVE", "CI"),
    "MTNCI": ("MTN_MOMO", "CI"),
    "CARD": ("CARD", "SN"),
}

V2_STATE_SUCCESS = {"succeeded", "success", "paid", "completed"}
V2_STATE_FAILED = {"failed", "canceled", "cancelled", "expired", "declined"}


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


def v2_supports(currency: str, country: str | None, method: str) -> bool:
    """La v2 ne couvre que l'Afrique en devise locale (cf. V2_COUNTRIES).
    Le frontend s'en sert pour router EUR/USD vers la v1."""
    return (
        (currency or "").upper() in V2_CURRENCIES
        and (country or "").upper() in V2_COUNTRIES
        and (method or "").upper() in V2_METHODS
    )


@router.get("/config")
async def v2_config() -> dict:
    """Le frontend n'affiche le parcours v2 que si `enabled` est vrai."""
    return {
        "enabled": V2_ENABLED,
        "org_id": V2_ORG_ID if V2_ENABLED else "",
        "env": V2_ENV,
        "base_url": V2_BASE_URL,
        "countries": sorted(V2_COUNTRIES),
        "methods": sorted(V2_METHODS),
        "currencies": sorted(V2_CURRENCIES),
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

    currency = str(payload.get("currency") or "XOF").upper()
    country = str(payload.get("country") or "").upper() or None
    method = str(payload.get("method") or "CARD").upper()
    if not v2_supports(currency, country, method):
        # Europe / USA (EUR, USD) : l'API v2 refuse, on laisse la v1 encaisser.
        raise HTTPException(
            status_code=409,
            detail=f"Paxity v2 ne prend pas en charge {currency}/{country or '??'} — utilisez la v1.",
        )

    db = request.app.state.db
    order = await db.orders.find_one({"id": order_id}, {"_id": 0, "id": 1})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")

    body = build_transaction_body(
        amount=amount,
        currency=currency,
        method=method,
        country=country,
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

    txn_id = data.get("id")
    await db.paxity_v2_sessions.update_one(
        {"order_id": order_id},
        {"$set": {"order_id": order_id, "txn_id": txn_id, "request": body, "response": data}},
        upsert=True,
    )
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"provider": "paxity-v2", "paxity_v2_txn_id": txn_id, "payment_method": method}},
    )
    logger.info(f"[PaxityV2] Transaction créée order={order_id} txn={txn_id} state={data.get('state')}")
    return {"order_id": order_id, "txn_id": txn_id, "state": data.get("state"), "paxity": data}


@router.post("/payin")
async def v2_payin(payload: dict, request: Request) -> dict:
    """Équivalent v2 de `POST /api/paxity/pay-in-mobile`.

    Accepte le MÊME corps que la v1 et renvoie le MÊME format de réponse :
    le frontend existant fonctionne sans modification, et le design du
    tunnel de paiement reste identique pour le client.
    """
    from paxity_router import (
        PAYMENT_METHODS, PaxityPayinRequest, PaxityTransaction,
        _persist_order, _is_test_env,
    )

    if not V2_ENABLED:
        raise HTTPException(status_code=503, detail="Paxity v2 n'est pas activé sur ce site.")

    req = PaxityPayinRequest(**payload)
    v1_method = str(req.payment_method or "").upper()
    meta = PAYMENT_METHODS.get(v1_method) or {}
    v2_method, country = V1_TO_V2.get(v1_method, (v1_method, meta.get("country")))
    currency = str(payload.get("currency") or "XOF").upper()

    if not v2_supports(currency, country, v2_method):
        # EUR / USD : hors périmètre v2, le frontend doit rappeler la v1.
        raise HTTPException(
            status_code=409,
            detail=f"Paxity v2 ne prend pas en charge {currency}/{country or '??'} — utilisez la v1.",
        )

    db = request.app.state.db
    is_test = _is_test_env(request)
    order_id = f"tmp_{uuid.uuid4().hex[:10]}"
    tx = PaxityTransaction(
        order_id=order_id,
        amount=req.amount,
        currency=currency,
        payment_method=v1_method,
        phone_number=req.phone_number,
        prefix_phone=req.prefix_phone,
        customer_name=(req.customer.name if req.customer else ""),
        customer_email=(req.customer.email if req.customer else None),
        description=req.description or f"Commande {order_id}",
    )
    # La commande est enregistrée AVANT l'appel : elle reste notre source de
    # vérité même si Paxity est injoignable.
    await _persist_order(db, order_id, req, tx, currency, is_test)

    body = build_transaction_body(
        amount=req.amount,
        currency=currency,
        method=v2_method,
        country=country,
        phone=f"+{req.prefix_phone}{req.phone_number}",
        email=(req.customer.email if req.customer else "") or "",
        description=tx.description,
        order_id=order_id,
        callback_url=_callback_url(request),
    )
    code, data = await create_transaction(
        body, str(uuid.uuid5(uuid.NAMESPACE_URL, f"paxity-v2:{order_id}")),
    )
    if code >= 400:
        logger.error(f"[PaxityV2] PayIn refusé ({code}) order={order_id} resp={data}")
        raise HTTPException(status_code=502, detail="Paxity a refusé la création du paiement.")

    txn_id = data.get("id")
    state = str(data.get("state") or "").lower()
    status = "success" if state in V2_STATE_SUCCESS else ("failed" if state in V2_STATE_FAILED else "pending")
    tx.paxity_transaction_id = txn_id
    tx.status = status

    await db.paxity_transactions.insert_one({**tx.model_dump(), "provider": "paxity-v2"})
    await db.paxity_v2_sessions.update_one(
        {"order_id": order_id},
        {"$set": {"order_id": order_id, "txn_id": txn_id, "request": body, "response": data}},
        upsert=True,
    )
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"provider": "paxity-v2", "paxity_v2_txn_id": txn_id}},
    )

    final_order_id = order_id
    if status == "success":
        from paxity_router import _handle_payment_success
        await _handle_payment_success(db, order_id)
        # La commande a reçu son numéro séquentiel : on le renvoie au
        # navigateur, sinon la page de confirmation affiche un numéro vide.
        renamed = await db.orders.find_one({"tmp_id": order_id}, {"_id": 0, "id": 1})
        if renamed and renamed.get("id"):
            final_order_id = renamed["id"]

    logger.info(f"[PaxityV2] PayIn order={final_order_id} txn={txn_id} state={state} -> {status}")
    # Format de réponse IDENTIQUE à la v1 (cf. _payin_response)
    return {
        "order_id": final_order_id,
        "transaction_id": tx.id,
        "status": status,
        "raw_status": data.get("state"),
        "amount": req.amount,
        "currency": currency,
        "paxity_transaction_id": txn_id,
        "payment_link": data.get("payment_link") or data.get("checkout_url"),
        "qr_code": data.get("qr_code"),
        "message": data.get("instructions"),
        "requires_otp": bool(meta.get("requires_otp")),
        "provider": "paxity-v2",
    }


async def fetch_transaction(txn_id: str) -> tuple[int, dict]:
    """GET /v2/external/transactions/{id} — permet de confirmer un paiement
    même si le client a fermé son navigateur (filet de sécurité serveur)."""
    url = f"{V2_BASE_URL.rstrip('/')}/v2/external/transactions/{txn_id}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers=_headers(str(uuid.uuid4())))
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text[:500]}


@router.get("/status/{txn_id}")
async def v2_status(txn_id: str) -> dict:
    if not V2_ENABLED:
        raise HTTPException(status_code=503, detail="Paxity v2 n'est pas activé sur ce site.")
    code, data = await fetch_transaction(txn_id)
    if code >= 400:
        raise HTTPException(status_code=502, detail="Statut indisponible")
    return {"txn_id": txn_id, "state": data.get("state"), "paxity": data}
