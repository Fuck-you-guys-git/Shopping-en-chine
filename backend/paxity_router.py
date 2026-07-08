"""
Paxity payment gateway integration.

Docs: https://paxity.io/documentation/api-direct
Endpoint: POST https://api.paxity.com/v1/payments/payin/

Headers required:
    x-api-key
    x-api-token
    Content-Type: application/json

Payload:
{
    "amount": 100,
    "currency": "XOF",
    "phoneNumber": "77XXXXXXX",
    "prefixPhone": "221",
    "paymentMethod": "OMSN",
    "codeOtp": "string",
    "description": "...",
    "idClient": ""
}
"""
from __future__ import annotations
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
PAXITY_API_KEY = os.environ.get("PAXITY_API_KEY", "")
PAXITY_API_TOKEN = os.environ.get("PAXITY_API_TOKEN", "")
PAXITY_BASE_URL = os.environ.get("PAXITY_BASE_URL", "https://api.paxity.com/v1")
PAXITY_ENV = os.environ.get("PAXITY_ENV", "production")

PAXITY_CONFIGURED = bool(PAXITY_API_KEY and PAXITY_API_TOKEN)

# Payment method codes supported by Paxity
PAYMENT_METHODS = {
    "OMSN": {"label": "Orange Money Sénégal", "country": "SN", "prefix": "221", "icon": "orange-money"},
    "OMCI": {"label": "Orange Money Côte d'Ivoire", "country": "CI", "prefix": "225", "icon": "orange-money"},
    "WAVESN": {"label": "Wave Sénégal", "country": "SN", "prefix": "221", "icon": "wave"},
    "WAVECI": {"label": "Wave Côte d'Ivoire", "country": "CI", "prefix": "225", "icon": "wave"},
    "MTNCI": {"label": "MTN Mobile Money", "country": "CI", "prefix": "225", "icon": "mtn"},
    "MOOVCI": {"label": "Moov Money", "country": "CI", "prefix": "225", "icon": "moov"},
    "CARD": {"label": "Carte bancaire", "country": "*", "prefix": "*", "icon": "card"},
}


# --------------------------------------------------------------------------
# Pydantic models
# --------------------------------------------------------------------------
class PaxityCustomer(BaseModel):
    name: str
    email: Optional[str] = None
    city: Optional[str] = None


class PaxityOrderItem(BaseModel):
    product_id: str
    name: str
    price: float
    qty: int = 1


class PaxityPayinRequest(BaseModel):
    """Request body sent by the frontend to initiate a payment."""
    amount: float
    phone_number: str
    prefix_phone: str = "221"
    payment_method: str  # OMSN | WAVESN | OMCI | WAVECI | MTNCI | MOOVCI | CARD
    otp_code: Optional[str] = None
    description: str = "Commande Shopping en Chine"
    customer: PaxityCustomer
    items: list[PaxityOrderItem] = []


class PaxityTransaction(BaseModel):
    id: str = Field(default_factory=lambda: f"tx_{uuid.uuid4().hex[:16]}")
    order_id: str
    amount: float
    currency: str = "XOF"
    payment_method: str
    phone_number: str
    prefix_phone: str
    status: str = "pending"  # pending | success | failed | cancelled
    paxity_transaction_id: Optional[str] = None
    paxity_reference: Optional[str] = None
    customer_name: str
    customer_email: Optional[str] = None
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    raw_response: Optional[dict | list] = None


# --------------------------------------------------------------------------
# Router
# --------------------------------------------------------------------------
router = APIRouter(prefix="/paxity", tags=["paxity"])


def _db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _headers() -> dict:
    return {
        "x-api-key": PAXITY_API_KEY,
        "x-api-token": PAXITY_API_TOKEN,
        "Content-Type": "application/json",
    }


@router.get("/config")
async def get_config():
    """Frontend polls this to know which payment methods are enabled."""
    return {
        "configured": PAXITY_CONFIGURED,
        "environment": PAXITY_ENV,
        "methods": [
            {"code": code, **meta}
            for code, meta in PAYMENT_METHODS.items()
        ],
        "currency": "XOF",
    }


@router.post("/payin")
async def create_payin(payload: PaxityPayinRequest, request: Request, bg: BackgroundTasks):
    """
    Initiate a Paxity PayIn (customer pays merchant).

    IMPORTANT: This handler is wrapped in a global try/except so that any
    unexpected failure returns a proper JSON error instead of crashing the
    process and triggering a Cloudflare 520/521 in front of the app.
    """
    if not PAXITY_CONFIGURED:
        raise HTTPException(
            status_code=503,
            detail=(
                "Paxity n'est pas configuré. Ajoutez PAXITY_API_KEY et "
                "PAXITY_API_TOKEN dans backend/.env puis redémarrez le serveur."
            ),
        )
    if payload.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Méthode de paiement inconnue : {payload.payment_method}")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")

    db = _db(request)
    order_id = f"ord_{uuid.uuid4().hex[:12]}"

    tx = PaxityTransaction(
        order_id=order_id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        phone_number=payload.phone_number,
        prefix_phone=payload.prefix_phone,
        customer_name=payload.customer.name,
        customer_email=payload.customer.email,
        description=payload.description,
    )

    # Persist the order first (source of truth even if Paxity is down)
    try:
        await db.orders.insert_one({
            "id": order_id,
            "customer": payload.customer.model_dump(),
            "items": [it.model_dump() for it in payload.items],
            "amount": payload.amount,
            "currency": "XOF",
            "status": "pending",
            "payment_method": payload.payment_method,
            "transaction_id": tx.id,
            "created_at": tx.created_at.isoformat(),
        })
    except Exception as e:
        logger.exception("[Paxity] Mongo insert failed")
        # Don't fail the payment because Mongo is transient — continue anyway
        pass

    body = {
        "amount": int(payload.amount),
        "currency": "XOF",
        "phoneNumber": payload.phone_number.replace(" ", ""),
        "prefixPhone": payload.prefix_phone,
        "paymentMethod": payload.payment_method,
        "codeOtp": payload.otp_code or "",
        "description": payload.description,
        "idClient": order_id,
    }

    logger.info(f"[Paxity] PayIn request order={order_id} amount={payload.amount} method={payload.payment_method}")

    # ---- Robust Paxity call ----
    # Timeout is short enough to stay well below Cloudflare's 100s limit and
    # we always return a proper JSON response, even on the worst case.
    resp = None
    data: dict = {}
    error_message: str | None = None

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                f"{PAXITY_BASE_URL}/payments/payin/",
                headers=_headers(),
                json=body,
            )
    except httpx.TimeoutException:
        error_message = "Le serveur Paxity a mis trop de temps à répondre. Réessayez."
        logger.exception("[Paxity] Timeout")
    except httpx.RequestError as e:
        error_message = f"Erreur réseau vers Paxity : {e}"
        logger.exception("[Paxity] Network error")
    except Exception as e:  # noqa: BLE001
        error_message = f"Erreur inattendue : {e}"
        logger.exception("[Paxity] Unexpected transport error")

    if resp is not None:
        # Parse JSON safely — Paxity sometimes returns HTML on errors.
        try:
            data = resp.json() if resp.content else {}
            if not isinstance(data, dict):
                data = {"raw": data}
        except Exception:
            text_preview = (resp.text or "")[:500]
            data = {"raw_text": text_preview}
            logger.warning(f"[Paxity] Non-JSON response ({resp.status_code}): {text_preview!r}")

    # Update transaction with whatever we have
    try:
        tx.raw_response = data
        tx.paxity_transaction_id = (
            data.get("transactionId") or data.get("id") or data.get("txId")
            if isinstance(data, dict) else None
        )
        tx.paxity_reference = (
            data.get("reference") or data.get("ref")
            if isinstance(data, dict) else None
        )
    except Exception:
        logger.exception("[Paxity] Failed to parse Paxity fields")

    # Determine final status
    if error_message or resp is None:
        tx.status = "failed"
        # Persist and return a proper error
        try:
            await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "failed"}})
        except Exception:
            logger.exception("[Paxity] Mongo write failed on error path")
        raise HTTPException(status_code=502, detail=error_message or "Aucune réponse de Paxity")

    if resp.status_code >= 400:
        tx.status = "failed"
        try:
            await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "failed"}})
        except Exception:
            logger.exception("[Paxity] Mongo write failed on 4xx path")
        message = (
            data.get("message") if isinstance(data, dict) else None
        ) or (
            data.get("error") if isinstance(data, dict) else None
        ) or f"Paxity a renvoyé une erreur ({resp.status_code})"
        logger.error(f"[Paxity] {resp.status_code} — {data}")
        raise HTTPException(status_code=resp.status_code, detail=str(message))

    # Best-effort status parsing
    raw_status = str(data.get("status", "pending") if isinstance(data, dict) else "pending").lower()
    if raw_status in ("success", "completed", "paid", "successful"):
        tx.status = "success"
    elif raw_status in ("failed", "error", "cancelled"):
        tx.status = "failed"
    else:
        tx.status = "pending"

    try:
        await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
        await db.orders.update_one({"id": order_id}, {"$set": {"status": tx.status}})
    except Exception:
        logger.exception("[Paxity] Mongo write failed on success path")

    return {
        "order_id": order_id,
        "transaction_id": tx.id,
        "status": tx.status,
        "amount": payload.amount,
        "currency": "XOF",
        "paxity_transaction_id": tx.paxity_transaction_id,
        "message": data.get("message") if isinstance(data, dict) else None,
    }


@router.get("/status/{transaction_id}")
async def check_status(transaction_id: str, request: Request):
    """Poll the payment status."""
    db = _db(request)
    tx = await db.paxity_transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    return {
        "transaction_id": tx["id"],
        "order_id": tx["order_id"],
        "status": tx["status"],
        "amount": tx["amount"],
        "currency": tx.get("currency", "XOF"),
        "updated_at": tx.get("updated_at"),
    }


@router.post("/webhook")
async def paxity_webhook(request: Request):
    """
    Instant Payment Notification (IPN) endpoint.
    Paxity will POST here when a transaction status changes.
    Configure the URL in your Paxity merchant dashboard:
        https://YOUR-DOMAIN.com/api/paxity/webhook
    """
    db = _db(request)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    logger.info(f"[Paxity] Webhook received: {payload}")

    paxity_tx_id = (
        payload.get("transactionId")
        or payload.get("id")
        or payload.get("txId")
    )
    order_id = payload.get("idClient") or payload.get("orderId")
    raw_status = str(payload.get("status", "")).lower()

    normalized = "pending"
    if raw_status in ("success", "completed", "paid", "successful"):
        normalized = "success"
    elif raw_status in ("failed", "error", "cancelled"):
        normalized = "failed"

    update = {
        "status": normalized,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "webhook_payload": payload,
    }

    # Try to find by paxity id first, then by order id
    tx_query = None
    if paxity_tx_id:
        tx_query = {"paxity_transaction_id": paxity_tx_id}
    elif order_id:
        tx_query = {"order_id": order_id}

    if tx_query:
        result = await db.paxity_transactions.update_one(tx_query, {"$set": update})
        if result.matched_count and order_id:
            await db.orders.update_one({"id": order_id}, {"$set": {"status": normalized}})

    return {"received": True}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    """Fetch order details by id."""
    db = _db(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order
