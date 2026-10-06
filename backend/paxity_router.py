"""
Paxity API v2 — Wave / Orange Money, F CFA uniquement.

POST {PAXITY_V2_BASE_URL}/v2/external/transactions  (en-têtes X-Api-Key,
organizationId, Idempotency-Key). La clé `pax_live_…` encaisse en réel,
`pax_test_…` en bac à sable. Sans clé, le paiement est désactivé.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth_router import get_current_seller
from email_service import maybe_send_order_confirmation, maybe_send_customer_confirmation
from orders_router import next_order_number, next_test_order_number
from products_router import decrement_stock_for_order

logger = logging.getLogger(__name__)

V2_BASE_URL = os.environ.get("PAXITY_V2_BASE_URL", "https://api-v2.paxity.io").rstrip("/")
V2_ORG_ID = os.environ.get("PAXITY_V2_ORG_ID", "").strip()
V2_API_KEY = os.environ.get("PAXITY_V2_API_KEY", "").strip()
PAXITY_IPN_URL = os.environ.get("PAXITY_IPN_URL", "").strip()
V2_ENV = "live" if V2_API_KEY.startswith("pax_live_") else "test"
PAXITY_CONFIGURED = bool(V2_API_KEY and V2_ORG_ID)
CURRENCY = "XOF"
DEFAULT_PREFIX = "221"
PROVIDER = "paxity-v2"

# Codes historiques (db.orders.payment_method) -> méthode + pays attendus par la v2
PAYMENT_METHODS = {
    "WAVESN": {"label": "Wave Sénégal",               "country": "SN", "prefix": "221", "icon": "wave",         "method": "WAVE",         "requires_otp": False},
    "WAVECI": {"label": "Wave Côte d'Ivoire",         "country": "CI", "prefix": "225", "icon": "wave",         "method": "WAVE",         "requires_otp": False},
    "OMSN":   {"label": "Orange Money Sénégal",       "country": "SN", "prefix": "221", "icon": "orange-money", "method": "ORANGE_MONEY", "requires_otp": False},
    "OMCI":   {"label": "Orange Money Côte d'Ivoire", "country": "CI", "prefix": "225", "icon": "orange-money", "method": "ORANGE_MONEY", "requires_otp": False},
}

_STATE_SUCCESS = {"success", "succeeded", "successful", "paid", "completed", "confirmed"}
_STATE_FAILED = {
    "failed", "failure", "error", "canceled", "cancelled", "declined",
    "rejected", "expired", "timeout", "aborted",
}


def map_state(raw: object) -> str:
    """État Paxity v2 -> success | failed | pending."""
    s = str(raw or "").strip().lower().replace(" ", "_")
    if s in _STATE_SUCCESS:
        return "success"
    if s in _STATE_FAILED:
        return "failed"
    return "pending"


def _is_test_env(request: Request) -> bool:
    """Preview / localhost : numéros de commande TEST-xxx, jamais un vrai numéro."""
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "")
    host = host.split(",")[0].strip().lower()
    return ".preview.emergentagent.com" in host or host.startswith(("localhost", "127."))


def _callback_url(request: Request) -> str:
    if PAXITY_IPN_URL:
        return PAXITY_IPN_URL
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    if not host or host.startswith(("localhost", "127.", "10.", "192.168.")):
        return ""
    proto = (request.headers.get("x-forwarded-proto") or "https").split(",")[0].strip()
    return f"{proto}://{host}/api/paxity/webhook"


# --------------------------------------------------------------------------
# Modèles
# --------------------------------------------------------------------------
class PaxityCustomer(BaseModel):
    name: str
    email: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class PaxityOrderItem(BaseModel):
    product_id: str
    name: str
    price: float
    qty: int = 1
    color: Optional[str] = None
    size: Optional[str] = None


class PaxityPayinRequest(BaseModel):
    amount: float
    phone_number: str
    prefix_phone: str = DEFAULT_PREFIX
    payment_method: str  # WAVESN | WAVECI | OMSN | OMCI
    description: str = "Commande Shopping en Chine"
    delivery_mode: Optional[str] = "standard"
    customer: PaxityCustomer
    items: list[PaxityOrderItem] = []


class PaxityTransaction(BaseModel):
    id: str = Field(default_factory=lambda: f"tx_{uuid.uuid4().hex[:16]}")
    order_id: str
    amount: float
    currency: str = CURRENCY
    payment_method: str
    phone_number: str
    prefix_phone: str
    status: str = "pending"  # pending | success | failed
    provider: str = PROVIDER
    paxity_transaction_id: Optional[str] = None
    payment_link: Optional[str] = None
    qr_code: Optional[str] = None
    customer_name: str
    customer_email: Optional[str] = None
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    raw_response: Optional[dict] = None


# --------------------------------------------------------------------------
# Appels Paxity v2
# --------------------------------------------------------------------------
def _headers(idempotency_key: str) -> dict:
    return {
        "X-Api-Key": V2_API_KEY,
        "organizationId": V2_ORG_ID,
        "Idempotency-Key": idempotency_key,
        "Paxity-Request-Id": f"sec_{uuid.uuid4().hex[:12]}",
        "Content-Type": "application/json",
    }


async def create_transaction(body: dict, idempotency_key: str) -> tuple[int, dict]:
    url = f"{V2_BASE_URL}/v2/external/transactions"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
            r = await client.post(url, json=body, headers=_headers(idempotency_key))
    except httpx.RequestError as e:
        logger.error(f"[Paxity] Transport error: {type(e).__name__}: {e}")
        return 0, {"detail": str(e)}
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text[:500]}


async def fetch_transaction(txn_id: str) -> tuple[int, dict]:
    url = f"{V2_BASE_URL}/v2/external/transactions/{txn_id}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers=_headers(str(uuid.uuid4())))
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text[:500]}


# --------------------------------------------------------------------------
# Router
# --------------------------------------------------------------------------
router = APIRouter(prefix="/paxity", tags=["paxity"])


def _db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


@router.get("/config")
async def get_config() -> dict:
    return {
        "configured": PAXITY_CONFIGURED,
        "environment": V2_ENV,
        "currency": CURRENCY,
        "default_prefix": DEFAULT_PREFIX,
        "methods": [{"code": code, **meta} for code, meta in PAYMENT_METHODS.items()],
    }


async def _persist_order(db: AsyncIOMotorDatabase, order_id: str, payload: PaxityPayinRequest,
                         tx: PaxityTransaction, is_test: bool) -> None:
    """La commande est enregistrée AVANT l'appel Paxity : source de vérité."""
    await db.orders.insert_one({
        "id": order_id,
        "is_test": is_test,
        "provider": PROVIDER,
        "customer": payload.customer.model_dump(),
        "items": [it.model_dump() for it in payload.items],
        "amount": payload.amount,
        "amount_xof": payload.amount,
        "currency": CURRENCY,
        "status": "pending",
        "payment_method": payload.payment_method,
        "delivery_mode": payload.delivery_mode or "standard",
        "transaction_id": tx.id,
        "created_at": tx.created_at.isoformat(),
        "tracking_step": "ordered",
        "tracking_history": [{"step": "ordered", "at": tx.created_at.isoformat()}],
    })


async def _finalize_order_number(db: AsyncIOMotorDatabase, order_id: str) -> str:
    """Numéro séquentiel attribué AU PAIEMENT CONFIRMÉ uniquement (idempotent)."""
    if not str(order_id).startswith("tmp_"):
        return order_id
    order = await db.orders.find_one({"id": order_id}, {"_id": 0, "is_test": 1})
    new_no = await (next_test_order_number(db) if order and order.get("is_test") else next_order_number(db))
    res = await db.orders.update_one({"id": order_id}, {"$set": {"id": new_no, "tmp_id": order_id}})
    if res.matched_count:
        await db.paxity_transactions.update_many({"order_id": order_id}, {"$set": {"order_id": new_no}})
        logger.info(f"[Paxity] Numéro de commande attribué : {order_id} → {new_no}")
        return new_no
    doc = await db.orders.find_one({"tmp_id": order_id}, {"_id": 0, "id": 1})
    return doc["id"] if doc else order_id


async def _handle_payment_success(db: AsyncIOMotorDatabase, order_id: str) -> str:
    """Paiement confirmé : numéro définitif, statut, stock, emails (une seule fois)."""
    order_id = await _finalize_order_number(db, order_id)
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "success"}})
    await decrement_stock_for_order(db, order_id)
    await maybe_send_order_confirmation(db, order_id)
    await maybe_send_customer_confirmation(db, order_id)
    return order_id


@router.post("/payin")
async def create_payin(payload: PaxityPayinRequest, request: Request) -> dict:
    if not PAXITY_CONFIGURED:
        raise HTTPException(status_code=503, detail="Le paiement en ligne est momentanément indisponible.")
    meta = PAYMENT_METHODS.get(str(payload.payment_method or "").upper())
    if not meta:
        raise HTTPException(status_code=400, detail="Moyen de paiement non pris en charge.")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide.")
    phone = "".join(ch for ch in payload.phone_number if ch.isdigit())
    prefix = "".join(ch for ch in payload.prefix_phone if ch.isdigit()) or DEFAULT_PREFIX
    if len(phone) < 8:
        raise HTTPException(status_code=400, detail="Numéro de téléphone invalide.")

    db = _db(request)
    order_id = f"tmp_{uuid.uuid4().hex[:10]}"
    tx = PaxityTransaction(
        order_id=order_id,
        amount=payload.amount,
        payment_method=str(payload.payment_method).upper(),
        phone_number=phone,
        prefix_phone=prefix,
        customer_name=payload.customer.name,
        customer_email=payload.customer.email,
        description=payload.description or f"Commande {order_id}",
    )
    await _persist_order(db, order_id, payload, tx, _is_test_env(request))

    body = {
        "amount_minor": int(round(payload.amount)),
        "currency": CURRENCY,
        "country": meta["country"],
        "method": meta["method"],
        "customer": {"phone": f"+{prefix}{phone}", "email": payload.customer.email or "", "name": payload.customer.name},
        "description": tx.description,
        "metadata": {"order_id": order_id},
    }
    callback = _callback_url(request)
    if callback:
        body["callback_url"] = callback

    code, data = await create_transaction(body, str(uuid.uuid5(uuid.NAMESPACE_URL, f"paxity-v2:{order_id}")))
    if code == 0 or code >= 400:
        tx.status = "failed"
        tx.raw_response = data
        await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
        await db.orders.update_one({"id": order_id}, {"$set": {"status": "failed"}})
        logger.error(f"[Paxity] Création refusée ({code}) order={order_id} method={meta['method']} resp={data}")
        if code == 0:
            raise HTTPException(status_code=424, detail="Aucune réponse de Paxity. Veuillez réessayer.")
        raise HTTPException(status_code=502, detail="Paxity a refusé le paiement. Vérifiez votre numéro et réessayez.")

    tx.paxity_transaction_id = data.get("id")
    tx.payment_link = data.get("redirect_url") or data.get("deep_link")
    tx.qr_code = data.get("qr_code")
    tx.status = map_state(data.get("state"))
    tx.raw_response = data
    await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": tx.status, "paxity_v2_txn_id": tx.paxity_transaction_id}},
    )

    final_order_id = order_id
    if tx.status == "success":
        final_order_id = await _handle_payment_success(db, order_id)
    elif tx.status == "pending":
        asyncio.create_task(_watch_pending_tx(db, tx.id))

    logger.info(f"[Paxity] PayIn order={final_order_id} txn={tx.paxity_transaction_id} state={data.get('state')} -> {tx.status}")
    return {
        "order_id": final_order_id,
        "transaction_id": tx.id,
        "status": tx.status,
        "raw_status": data.get("state"),
        "amount": payload.amount,
        "currency": CURRENCY,
        "paxity_transaction_id": tx.paxity_transaction_id,
        "payment_link": tx.payment_link,
        "qr_code": tx.qr_code,
        "message": data.get("instructions"),
        "provider": PROVIDER,
    }


async def _refresh_pending_tx(db: AsyncIOMotorDatabase, tx: dict) -> str:
    """Interroge Paxity v2 pour une transaction pending ; met à jour commande,
    stock et emails si elle est confirmée. Mutate `tx`, renvoie le statut."""
    if tx.get("status") != "pending" or not tx.get("paxity_transaction_id") or not PAXITY_CONFIGURED:
        return tx.get("status", "pending")
    try:
        code, data = await fetch_transaction(tx["paxity_transaction_id"])
    except Exception:
        logger.warning("[Paxity] Statut v2 indisponible", exc_info=True)
        return "pending"
    if code != 200:
        return "pending"
    fresh = map_state(data.get("state"))
    if fresh == "pending":
        return "pending"
    now = datetime.now(timezone.utc).isoformat()
    await db.paxity_transactions.update_one({"id": tx["id"]}, {"$set": {"status": fresh, "updated_at": now}})
    if fresh == "success":
        tx["order_id"] = await _handle_payment_success(db, tx["order_id"])
    else:
        await db.orders.update_one({"id": tx["order_id"]}, {"$set": {"status": fresh}})
    tx["status"] = fresh
    tx["updated_at"] = now
    logger.info(f"[Paxity] Statut rafraîchi tx={tx['id']} -> {fresh}")
    return fresh


@router.get("/status/{transaction_id}")
async def check_status(transaction_id: str, request: Request) -> dict:
    db = _db(request)
    tx = await db.paxity_transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    await _refresh_pending_tx(db, tx)
    return {
        "transaction_id": tx["id"],
        "order_id": tx["order_id"],
        "status": tx["status"],
        "amount": tx["amount"],
        "currency": tx.get("currency", CURRENCY),
        "updated_at": tx.get("updated_at"),
    }


async def _watch_pending_tx(db: AsyncIOMotorDatabase, tx_id: str) -> None:
    """Filet de sécurité : vérifie toutes les 20 s pendant 15 min, même si le
    client ne revient jamais sur le site."""
    for _ in range(45):
        await asyncio.sleep(20)
        try:
            tx = await db.paxity_transactions.find_one({"id": tx_id}, {"_id": 0})
            if not tx or tx.get("status") != "pending":
                return
            if await _refresh_pending_tx(db, tx) != "pending":
                return
        except Exception:
            logger.warning(f"[Paxity] Watcher error tx={tx_id}", exc_info=True)


RECONCILE_MAX_AGE_HOURS = 24 * 7
RECONCILE_INTERVAL_SECONDS = 180
RECONCILE_BATCH = 200


async def reconcile_pending_transactions(db: AsyncIOMotorDatabase, *,
                                         max_age_hours: int = RECONCILE_MAX_AGE_HOURS) -> dict:
    """Rattrapage durable (survit aux redéploiements) des paiements « pending »."""
    if not PAXITY_CONFIGURED:
        return {"checked": 0, "confirmed": 0, "failed": 0, "unverifiable": 0}
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).strftime("%Y-%m-%dT%H:%M:%S")
    base = {"status": "pending", "created_at": {"$gte": cutoff}}
    unverifiable = await db.paxity_transactions.count_documents({**base, "paxity_transaction_id": {"$in": [None, ""]}})
    pending = await db.paxity_transactions.find(
        {**base, "paxity_transaction_id": {"$nin": [None, ""]}}, {"_id": 0}
    ).to_list(RECONCILE_BATCH)

    confirmed = failed = 0
    for tx in pending:
        try:
            status = await _refresh_pending_tx(db, tx)
        except Exception:
            logger.warning(f"[Paxity] Rattrapage impossible tx={tx.get('id')}", exc_info=True)
            continue
        confirmed += status == "success"
        failed += status == "failed"
    if confirmed or failed:
        logger.info(f"[Paxity] Rattrapage : {len(pending)} vérifiée(s) → {confirmed} confirmée(s), {failed} échouée(s)")
    return {"checked": len(pending), "confirmed": confirmed, "failed": failed, "unverifiable": unverifiable}


async def reconciliation_loop(db: AsyncIOMotorDatabase) -> None:
    await asyncio.sleep(15)
    while True:
        try:
            await reconcile_pending_transactions(db)
        except Exception:
            logger.warning("[Paxity] Boucle de rattrapage en erreur", exc_info=True)
        await asyncio.sleep(RECONCILE_INTERVAL_SECONDS)


@router.post("/reconcile")
async def reconcile_now(request: Request) -> dict:
    await get_current_seller(request)
    return await reconcile_pending_transactions(_db(request))


@router.post("/webhook")
async def paxity_webhook(request: Request) -> dict:
    """Notification Paxity (callback_url). Le payload n'est pas signé : on ne
    lui fait pas confiance, il déclenche une re-vérification auprès de Paxity."""
    db = _db(request)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    root = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    root = root if isinstance(root, dict) else {}
    logger.info(f"[Paxity] Webhook reçu : {root}")

    paxity_tx_id = root.get("id") or root.get("transaction_id") or root.get("txn_id") or root.get("transactionReference") or root.get("transactionId")
    order_id = (root.get("metadata") or {}).get("order_id") or root.get("idClient")
    query = {"paxity_transaction_id": paxity_tx_id} if paxity_tx_id else ({"order_id": order_id} if order_id else None)
    if not query:
        return {"received": True}
    tx = await db.paxity_transactions.find_one(query, {"_id": 0})
    if tx:
        await db.paxity_transactions.update_one({"id": tx["id"]}, {"$set": {"webhook_payload": payload}})
        await _refresh_pending_tx(db, tx)
    return {"received": True}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request) -> dict:
    """Accepte aussi l'id temporaire `tmp_xxx` (renommé au paiement confirmé)."""
    db = _db(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        order = await db.orders.find_one({"tmp_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order
