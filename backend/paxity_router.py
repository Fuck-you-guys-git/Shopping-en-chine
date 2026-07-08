"""
Paxity payment gateway integration.

Docs: https://paxity.io/documentation/api-direct
Endpoint: POST {PAXITY_BASE_URL}/payments/payin/

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

import asyncio
import logging
import os
import socket
import time
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# Configuration (all env-driven — no hardcoded host/currency/prefix)
# --------------------------------------------------------------------------
PAXITY_API_KEY = os.environ.get("PAXITY_API_KEY", "")
PAXITY_API_TOKEN = os.environ.get("PAXITY_API_TOKEN", "")
# Paxity's actual live API host is `api.paxity.io` (the merchant docs at
# paxity.io/documentation/api-direct mistakenly reference `api.paxity.com`,
# which does NOT resolve). The default below can be overridden per-env via
# PAXITY_BASE_URL in backend/.env if Paxity rotates hosts.
PAXITY_BASE_URL = os.environ.get("PAXITY_BASE_URL", "https://api.paxity.io/v1").rstrip("/")
PAXITY_ENV = os.environ.get("PAXITY_ENV", "production")
PAXITY_DEFAULT_CURRENCY = os.environ.get("PAXITY_DEFAULT_CURRENCY", "XOF")
PAXITY_DEFAULT_PREFIX = os.environ.get("PAXITY_DEFAULT_PREFIX", "221")
PAXITY_MAX_RETRIES = int(os.environ.get("PAXITY_MAX_RETRIES", "3"))
# Instant Payment Notification callback URL Paxity will POST to when a
# transaction status changes. Should point to /api/paxity/webhook of this app.
PAXITY_IPN_URL = os.environ.get("PAXITY_IPN_URL", "")

PAXITY_CONFIGURED = bool(PAXITY_API_KEY and PAXITY_API_TOKEN and PAXITY_BASE_URL)


def _extract_host(url: str) -> str:
    """Parse the host from a base URL so DNS lookups don't hardcode a domain."""
    if not url:
        return ""
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return parsed.hostname or ""


PAXITY_HOST = _extract_host(PAXITY_BASE_URL)

# Payment method codes supported by Paxity. `requires_otp` tells the frontend
# whether the operator forces an OTP validation before the payment can be
# submitted (e.g. Wave, some Orange Money flows).
PAYMENT_METHODS = {
    "OMSN":   {"label": "Orange Money Sénégal",       "country": "SN", "prefix": "221", "icon": "orange-money", "requires_otp": True},
    "OMCI":   {"label": "Orange Money Côte d'Ivoire", "country": "CI", "prefix": "225", "icon": "orange-money", "requires_otp": True},
    "WAVESN": {"label": "Wave Sénégal",               "country": "SN", "prefix": "221", "icon": "wave",         "requires_otp": False},
    "WAVECI": {"label": "Wave Côte d'Ivoire",         "country": "CI", "prefix": "225", "icon": "wave",         "requires_otp": False},
    "MTNCI":  {"label": "MTN Mobile Money",           "country": "CI", "prefix": "225", "icon": "mtn",          "requires_otp": False},
    "MOOVCI": {"label": "Moov Money",                 "country": "CI", "prefix": "225", "icon": "moov",         "requires_otp": False},
    "CARD":   {"label": "Carte bancaire",             "country": "*",  "prefix": "*",   "icon": "card",         "requires_otp": False},
}

# Comprehensive status mapping. Paxity (and mobile-money operators generally)
# use a variety of raw status strings; map them all to three internal states.
_STATUS_SUCCESS = {"success", "successful", "completed", "paid", "ok", "done", "confirmed"}
_STATUS_FAILED = {
    "failed", "failure", "error", "cancelled", "canceled",
    "declined", "rejected", "expired", "timeout", "aborted",
    "insufficient_funds", "insufficient-funds",
}
_STATUS_PENDING = {
    "pending", "processing", "in_progress", "in-progress",
    "awaiting_confirmation", "awaiting-confirmation",
    "awaiting_payment", "awaiting-payment",
    "initiated", "created", "queued", "sent", "otp_sent", "otp-sent",
}


def _map_status(raw: object) -> str:
    """Normalize any Paxity/operator status string to success | failed | pending."""
    s = str(raw or "").strip().lower().replace(" ", "_")
    if not s:
        return "pending"
    if s in _STATUS_SUCCESS:
        return "success"
    if s in _STATUS_FAILED:
        return "failed"
    if s in _STATUS_PENDING:
        return "pending"
    # Unknown status -> treat as pending; log so we can extend the map later
    logger.warning(f"[Paxity] Unmapped status '{raw}' — treating as pending")
    return "pending"


def _extract_error_message(data: object, status_code: int) -> str:
    """
    Dig through a Paxity error response to surface the real message.
    Handles: {"message": ...}, {"error": ...}, {"error": {"message": ...}},
    {"errors": [{"message": ...}]}, {"data": {"message": ...}}, and RFC 7807-style.
    """
    if isinstance(data, dict):
        # Direct fields
        for key in ("message", "error_message", "detail", "description"):
            v = data.get(key)
            if isinstance(v, str) and v:
                return v
        # Nested error object
        err = data.get("error")
        if isinstance(err, dict):
            for key in ("message", "detail", "description"):
                v = err.get(key)
                if isinstance(v, str) and v:
                    return v
        elif isinstance(err, str) and err:
            return err
        # Nested data object
        dat = data.get("data")
        if isinstance(dat, dict):
            for key in ("message", "error", "detail"):
                v = dat.get(key)
                if isinstance(v, str) and v:
                    return v
        # errors[] array
        errs = data.get("errors")
        if isinstance(errs, list) and errs:
            first = errs[0]
            if isinstance(first, dict):
                for key in ("message", "detail", "description"):
                    v = first.get(key)
                    if isinstance(v, str) and v:
                        return v
            elif isinstance(first, str) and first:
                return first
        # Non-JSON preview
        raw_text = data.get("raw_text")
        if isinstance(raw_text, str) and raw_text:
            return raw_text[:200]
    return f"Paxity a renvoyé une erreur ({status_code})"


def _payload_root(data: object) -> dict:
    """
    Paxity wraps the transaction details in a nested `data` object:
        {"code": 201, "message": "...", "data": {"status": "PENDING",
         "transactionId": "...", "link": "...", "qrCode": "..."}}
    Return the inner object when present, otherwise the top-level dict so the
    parser keeps working if Paxity ever flattens the schema.
    """
    if isinstance(data, dict):
        inner = data.get("data")
        if isinstance(inner, dict) and inner:
            return inner
        return data
    return {}


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
    prefix_phone: str = PAXITY_DEFAULT_PREFIX
    payment_method: str  # OMSN | WAVESN | OMCI | WAVECI | MTNCI | MOOVCI | CARD
    otp_code: Optional[str] = None
    description: str = "Commande Shopping en Chine"
    currency: Optional[str] = None  # override PAXITY_DEFAULT_CURRENCY if provided
    customer: PaxityCustomer
    items: list[PaxityOrderItem] = []


class PaxityTransaction(BaseModel):
    id: str = Field(default_factory=lambda: f"tx_{uuid.uuid4().hex[:16]}")
    order_id: str
    amount: float
    currency: str = PAXITY_DEFAULT_CURRENCY
    payment_method: str
    phone_number: str
    prefix_phone: str
    status: str = "pending"  # pending | success | failed
    paxity_transaction_id: Optional[str] = None
    paxity_reference: Optional[str] = None
    payment_link: Optional[str] = None
    qr_code: Optional[str] = None
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


def _redact(body: dict) -> dict:
    """Strip PII from a payload before logging."""
    safe = dict(body)
    if "phoneNumber" in safe:
        pn = str(safe["phoneNumber"])
        safe["phoneNumber"] = f"***{pn[-3:]}" if len(pn) > 3 else "***"
    if "codeOtp" in safe and safe["codeOtp"]:
        safe["codeOtp"] = "***"
    return safe


async def _post_with_retry(url: str, headers: dict, json_body: dict) -> tuple[Optional[httpx.Response], Optional[str]]:
    """
    Robust POST with exponential backoff for transient network / timeout errors.
    Does NOT retry on 4xx (client errors — retrying wastes time and risks
    duplicating charges). Retries at most PAXITY_MAX_RETRIES times.
    """
    last_error: Optional[str] = None
    for attempt in range(1, PAXITY_MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0)) as client:
                resp = await client.post(url, headers=headers, json=json_body)
                # Retry on 5xx (server error) and 429 (rate limit)
                if resp.status_code >= 500 or resp.status_code == 429:
                    last_error = f"Paxity {resp.status_code}"
                    logger.warning(f"[Paxity] Attempt {attempt}/{PAXITY_MAX_RETRIES}: {last_error}")
                    if attempt < PAXITY_MAX_RETRIES:
                        await asyncio.sleep(0.5 * (2 ** (attempt - 1)))
                        continue
                return resp, None
        except httpx.TimeoutException as e:
            last_error = f"Timeout: {e}"
            logger.warning(f"[Paxity] Attempt {attempt}/{PAXITY_MAX_RETRIES}: {last_error}")
        except httpx.RequestError as e:
            last_error = f"{type(e).__name__}: {e}"
            logger.warning(f"[Paxity] Attempt {attempt}/{PAXITY_MAX_RETRIES}: {last_error}")

        if attempt < PAXITY_MAX_RETRIES:
            await asyncio.sleep(0.5 * (2 ** (attempt - 1)))

    return None, last_error or "Aucune réponse de Paxity"


@router.get("/config")
async def get_config():
    """Frontend polls this to know which payment methods are enabled."""
    return {
        "configured": PAXITY_CONFIGURED,
        "environment": PAXITY_ENV,
        "base_url_set": bool(PAXITY_BASE_URL),
        "methods": [
            {"code": code, **meta}
            for code, meta in PAYMENT_METHODS.items()
        ],
        "currency": PAXITY_DEFAULT_CURRENCY,
        "default_prefix": PAXITY_DEFAULT_PREFIX,
    }


@router.get("/diagnostic")
async def diagnostic():
    """
    Diagnostic endpoint — call this to check if the backend can reach the
    Paxity API from its current network. Use it when payments are failing:
        curl https://YOUR-DOMAIN/api/paxity/diagnostic
    """
    result = {
        "configured": PAXITY_CONFIGURED,
        "environment": PAXITY_ENV,
        "base_url": PAXITY_BASE_URL or "(unset — configure PAXITY_BASE_URL in backend/.env)",
        "host": PAXITY_HOST or "(unset)",
        "api_key_length": len(PAXITY_API_KEY) if PAXITY_API_KEY else 0,
        "api_token_length": len(PAXITY_API_TOKEN) if PAXITY_API_TOKEN else 0,
        "dns_ok": False,
        "http_reachable": False,
        "http_status": None,
        "http_error": None,
        "response_preview": None,
        "latency_ms": None,
        "auth_test_status": None,
        "auth_test_body": None,
    }

    if not PAXITY_BASE_URL:
        result["http_error"] = (
            "PAXITY_BASE_URL is empty. Add it to backend/.env (e.g. "
            "PAXITY_BASE_URL=https://<your-paxity-host>/v1) and restart the backend."
        )
        return result

    # 1) DNS lookup — use the host extracted from PAXITY_BASE_URL (no hardcode)
    try:
        socket.gethostbyname(PAXITY_HOST)
        result["dns_ok"] = True
    except Exception as e:
        result["http_error"] = f"DNS lookup failed for {PAXITY_HOST!r}: {e}"
        return result

    # 2) Basic HTTP reachability
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{PAXITY_BASE_URL}/")
            result["http_reachable"] = True
            result["http_status"] = resp.status_code
            result["response_preview"] = (resp.text or "")[:200]
    except Exception as e:
        result["http_error"] = f"{type(e).__name__}: {e}"
    result["latency_ms"] = int((time.monotonic() - started) * 1000)

    # 3) Auth test — send an intentionally-tiny bad request to see if Paxity
    #    accepts our keys (400 with meaningful message = keys OK,
    #    401/403 = keys wrong)
    if result["http_reachable"] and PAXITY_CONFIGURED:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    f"{PAXITY_BASE_URL}/payments/payin/",
                    headers=_headers(),
                    json={
                        "amount": 100,
                        "currency": PAXITY_DEFAULT_CURRENCY,
                        "phoneNumber": "000000000",
                        "prefixPhone": PAXITY_DEFAULT_PREFIX,
                        "paymentMethod": "WAVESN",
                        "codeOtp": "",
                        "description": "diagnostic",
                        "idClient": "diag_test",
                    },
                )
                result["auth_test_status"] = r.status_code
                result["auth_test_body"] = (r.text or "")[:400]
        except Exception as e:
            result["auth_test_body"] = f"{type(e).__name__}: {e}"

    return result


@router.post("/payin")
async def create_payin(payload: PaxityPayinRequest, request: Request, bg: BackgroundTasks):
    """
    Initiate a Paxity PayIn (customer pays merchant).

    IMPORTANT: This handler is wrapped in defensive try/except so that any
    unexpected failure returns a proper JSON error instead of crashing the
    process and triggering a Cloudflare 520/521 in front of the app.
    """
    if not PAXITY_CONFIGURED:
        missing = []
        if not PAXITY_API_KEY:
            missing.append("PAXITY_API_KEY")
        if not PAXITY_API_TOKEN:
            missing.append("PAXITY_API_TOKEN")
        if not PAXITY_BASE_URL:
            missing.append("PAXITY_BASE_URL")
        raise HTTPException(
            status_code=503,
            detail=(
                f"Paxity n'est pas configuré. Ajoutez {', '.join(missing)} dans "
                "backend/.env puis redémarrez le serveur."
            ),
        )
    if payload.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Méthode de paiement inconnue : {payload.payment_method}")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")

    method_meta = PAYMENT_METHODS[payload.payment_method]

    # ---- Phase 3: OTP validation ----
    if method_meta.get("requires_otp") and not (payload.otp_code or "").strip():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Un code OTP est requis pour {method_meta['label']}. "
                "Composez le code de validation sur votre téléphone avant de payer."
            ),
        )

    currency = (payload.currency or PAXITY_DEFAULT_CURRENCY).upper()

    db = _db(request)
    order_id = f"ord_{uuid.uuid4().hex[:12]}"

    tx = PaxityTransaction(
        order_id=order_id,
        amount=payload.amount,
        currency=currency,
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
            "currency": currency,
            "status": "pending",
            "payment_method": payload.payment_method,
            "transaction_id": tx.id,
            "created_at": tx.created_at.isoformat(),
        })
    except Exception:
        logger.exception("[Paxity] Mongo insert failed — continuing anyway")

    body = {
        "amount": int(payload.amount),
        "country": method_meta.get("country") if method_meta.get("country") not in (None, "*") else None,
        "currency": currency,
        "phoneNumber": payload.phone_number.replace(" ", ""),
        "prefixPhone": payload.prefix_phone,
        "paymentMethod": payload.payment_method,
        "codeOtp": payload.otp_code or "",
        "description": payload.description,
        "idClient": order_id,
    }
    if PAXITY_IPN_URL:
        body["ipn"] = PAXITY_IPN_URL
    # Drop keys that resolved to None (e.g. country for CARD) so we send a clean payload
    body = {k: v for k, v in body.items() if v is not None}

    logger.info(
        f"[Paxity] PayIn request order={order_id} amount={payload.amount} "
        f"currency={currency} method={payload.payment_method} body={_redact(body)}"
    )

    # ---- Robust Paxity call with retry ----
    resp, transport_error = await _post_with_retry(
        f"{PAXITY_BASE_URL}/payments/payin/",
        _headers(),
        body,
    )

    data: dict = {}
    if resp is not None:
        try:
            data = resp.json() if resp.content else {}
            if not isinstance(data, dict):
                data = {"raw": data}
        except Exception:
            text_preview = (resp.text or "")[:500]
            data = {"raw_text": text_preview}
            logger.warning(f"[Paxity] Non-JSON response ({resp.status_code}): {text_preview!r}")

    # Update transaction with whatever we have (fields live inside the nested
    # `data` object per Paxity's response envelope)
    root = _payload_root(data)
    try:
        tx.raw_response = data
        if root:
            tx.paxity_transaction_id = (
                root.get("transactionId") or root.get("id") or root.get("txId")
            )
            tx.paxity_reference = root.get("reference") or root.get("ref")
            tx.payment_link = root.get("link") or root.get("paymentLink") or root.get("url")
            tx.qr_code = root.get("qrCode") or root.get("qr_code")
    except Exception:
        logger.exception("[Paxity] Failed to parse Paxity fields")

    # Transport failure (all retries exhausted)
    if transport_error or resp is None:
        tx.status = "failed"
        try:
            await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "failed"}})
        except Exception:
            logger.exception("[Paxity] Mongo write failed on error path")
        logger.error(f"[Paxity] Transport failure for order {order_id}: {transport_error}")
        # Use 424 Failed Dependency (upstream gateway unreachable). We deliberately
        # avoid 502/504 because Cloudflare rewrites those to its own HTML error
        # page, which would strip our French error detail from the client.
        raise HTTPException(
            status_code=424,
            detail=transport_error or "Aucune réponse de Paxity",
        )

    # HTTP error (>= 400) — surface Paxity's real message
    if resp.status_code >= 400:
        tx.status = "failed"
        try:
            await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "failed"}})
        except Exception:
            logger.exception("[Paxity] Mongo write failed on 4xx path")
        message = _extract_error_message(data, resp.status_code)
        logger.error(
            f"[Paxity] {resp.status_code} order={order_id} — request={_redact(body)} response={data}"
        )
        raise HTTPException(status_code=resp.status_code, detail=str(message))

    # 2xx — parse status with comprehensive mapping (status lives in nested data)
    raw_status = root.get("status") if root else None
    tx.status = _map_status(raw_status)

    try:
        await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
        await db.orders.update_one({"id": order_id}, {"$set": {"status": tx.status}})
    except Exception:
        logger.exception("[Paxity] Mongo write failed on success path")

    logger.info(
        f"[Paxity] PayIn response order={order_id} status={tx.status} "
        f"paxity_id={tx.paxity_transaction_id} raw_status={raw_status}"
    )

    return {
        "order_id": order_id,
        "transaction_id": tx.id,
        "status": tx.status,
        "raw_status": raw_status,
        "amount": payload.amount,
        "currency": currency,
        "paxity_transaction_id": tx.paxity_transaction_id,
        "payment_link": tx.payment_link,
        "qr_code": tx.qr_code,
        "message": (data.get("message") if isinstance(data, dict) else None),
        "requires_otp": bool(method_meta.get("requires_otp")),
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
        "currency": tx.get("currency", PAXITY_DEFAULT_CURRENCY),
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

    root = _payload_root(payload)
    paxity_tx_id = (
        root.get("transactionId")
        or root.get("id")
        or root.get("txId")
    )
    order_id = root.get("idClient") or root.get("orderId") or payload.get("idClient") or payload.get("orderId")
    normalized = _map_status(root.get("status") or payload.get("status"))

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
