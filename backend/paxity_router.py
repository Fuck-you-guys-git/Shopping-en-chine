"""
Paxity payment gateway integration.

Docs: https://paxity.io/documentation/api-direct
Live API host: transaction.paxity.io (base = https://transaction.paxity.io/api/v1)
Endpoint: POST {PAXITY_BASE_URL}/transaction/pay-in-mobile

Headers required:
    x-api-key
    x-api-token
    Content-Type: application/json

Payload:
{
    "amount": 100,
    "country": "SN",
    "currency": "XOF",
    "phoneNumber": "77XXXXXXX",
    "prefixPhone": "221",
    "paymentMethod": "OMSN",
    "codeOtp": "string",
    "description": "...",
    "idClient": ""
}

Response envelope:
{"code": 201, "message": "...", "data": {"status": "PENDING",
 "transactionId": "...", "link": "https://pay.wave.com/...", "qrCode": "..."}}
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
from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from email_service import maybe_send_order_confirmation, maybe_send_customer_confirmation
from orders_router import next_order_number, next_test_order_number

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# Configuration (all env-driven — no hardcoded host/currency/prefix)
# --------------------------------------------------------------------------
PAXITY_API_KEY = os.environ.get("PAXITY_API_KEY", "")
PAXITY_API_TOKEN = os.environ.get("PAXITY_API_TOKEN", "")
# Paxity's live API host is `transaction.paxity.io`. The public merchant docs
# reference an older `api.paxity.com`/`api.paxity.io/v1/payments/payin/` path
# that does NOT work — the real PayIn endpoint is
# `{base}/transaction/pay-in-mobile`. Override via PAXITY_BASE_URL in .env.
_LIVE_PAXITY_BASE = "https://transaction.paxity.io/api/v1"
_raw_base = os.environ.get("PAXITY_BASE_URL", _LIVE_PAXITY_BASE).rstrip("/")
# Self-heal: the legacy hosts (api.paxity.com / api.paxity.io) are dead or
# reject every credential. If a stale env (e.g. an old production deployment
# config) still points there, force the working live host so payments can
# never regress to a broken endpoint.
if "api.paxity.com" in _raw_base or "api.paxity.io" in _raw_base:
    logging.getLogger("paxity").warning(
        "[Paxity] Stale PAXITY_BASE_URL detected (%s) — overriding to %s",
        _raw_base, _LIVE_PAXITY_BASE,
    )
    _raw_base = _LIVE_PAXITY_BASE
PAXITY_BASE_URL = _raw_base
PAXITY_ENV = os.environ.get("PAXITY_ENV", "production")
PAXITY_DEFAULT_CURRENCY = os.environ.get("PAXITY_DEFAULT_CURRENCY", "XOF")
PAXITY_DEFAULT_PREFIX = os.environ.get("PAXITY_DEFAULT_PREFIX", "221")
PAXITY_MAX_RETRIES = int(os.environ.get("PAXITY_MAX_RETRIES", "3"))
# Instant Payment Notification callback URL Paxity will POST to when a
# transaction status changes. Should point to /api/paxity/webhook of this app.
PAXITY_IPN_URL = os.environ.get("PAXITY_IPN_URL", "")


def _public_ipn_url(request: Request) -> str:
    """
    Dérive l'URL publique du webhook depuis la requête entrante.
    Fonctionne en preview ET en production sans configuration :
    le host vu par le client (shoppingenchine.com / *.preview.emergentagent.com)
    devient l'endpoint IPN. PAXITY_IPN_URL (.env) reste prioritaire si défini.
    """
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    host = host.split(",")[0].strip()
    if not host or host.startswith(("localhost", "127.", "0.0.0.0", "10.", "192.168.")):
        return ""
    proto = (request.headers.get("x-forwarded-proto") or "https").split(",")[0].strip()
    return f"{proto}://{host}/api/paxity/webhook"


def _is_test_env(request: Request) -> bool:
    """Environnement de test (preview Emergent / localhost) : les commandes
    y reçoivent des numéros TEST-xxx et ne consomment JAMAIS un vrai numéro."""
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "")
    host = host.split(",")[0].strip().lower()
    return ".preview.emergentagent.com" in host or host.startswith(("localhost", "127."))
# Relative API paths on PAXITY_BASE_URL
PAXITY_PAYIN_PATH = "/transaction/pay-in-mobile"
PAXITY_BALANCE_PATH = "/paxity/balance"

PAXITY_CONFIGURED = bool(PAXITY_API_KEY and PAXITY_API_TOKEN and PAXITY_BASE_URL)


def _extract_host(url: str) -> str:
    """Parse the host from a base URL so DNS lookups don't hardcode a domain."""
    if not url:
        return ""
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return parsed.hostname or ""


PAXITY_HOST = _extract_host(PAXITY_BASE_URL)

# Payment method codes supported by Paxity (validated against the live
# GET /payment-method endpoint — this merchant account only supports Mobile
# Money; bank cards and MOOVCI are NOT allowed and return 403 ERR_FORBIDDEN).
# Per the live API, OMSN/OMCI are CODE_QR flows: the customer pays via the
# returned link/QR, so no OTP is required (codeOtp is still forwarded when
# the customer provides one).
PAYMENT_METHODS = {
    "OMSN":   {"label": "Orange Money Sénégal",       "country": "SN", "prefix": "221", "icon": "orange-money", "requires_otp": False},
    "OMCI":   {"label": "Orange Money Côte d'Ivoire", "country": "CI", "prefix": "225", "icon": "orange-money", "requires_otp": False},
    "WAVESN": {"label": "Wave Sénégal",               "country": "SN", "prefix": "221", "icon": "wave",         "requires_otp": False},
    "WAVECI": {"label": "Wave Côte d'Ivoire",         "country": "CI", "prefix": "225", "icon": "wave",         "requires_otp": False},
    "MTNCI":  {"label": "MTN Mobile Money",           "country": "CI", "prefix": "225", "icon": "mtn",          "requires_otp": False},
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


def _first_str(d: dict, *keys: str) -> Optional[str]:
    """Première valeur str non vide parmi les clés données."""
    for key in keys:
        v = d.get(key)
        if isinstance(v, str) and v:
            return v
    return None


def _extract_error_message(data: object, status_code: int) -> str:
    """
    Dig through a Paxity error response to surface the real message.
    Handles: {"message": ...}, {"error": ...}, {"error": {"message": ...}},
    {"errors": [{"message": ...}]}, {"data": {"message": ...}}, and RFC 7807-style.
    """
    if isinstance(data, dict):
        # Direct fields
        msg = _first_str(data, "message", "error_message", "detail", "description")
        if msg:
            return msg
        # Nested error object
        err = data.get("error")
        if isinstance(err, dict):
            msg = _first_str(err, "message", "detail", "description")
            if msg:
                return msg
        elif isinstance(err, str) and err:
            return err
        # Nested data object
        dat = data.get("data")
        if isinstance(dat, dict):
            msg = _first_str(dat, "message", "error", "detail")
            if msg:
                return msg
        # errors[] array
        errs = data.get("errors")
        if isinstance(errs, list) and errs:
            first = errs[0]
            if isinstance(first, dict):
                msg = _first_str(first, "message", "detail", "description")
                if msg:
                    return msg
            elif isinstance(first, str) and first:
                return first
        # Non-JSON preview
        raw_text = data.get("raw_text")
        if isinstance(raw_text, str) and raw_text:
            return raw_text[:200]
    # Status-specific friendly fallbacks (Paxity often returns an empty body)
    if status_code in (401, 403):
        return (
            "Identifiants Paxity refusés (401). Vérifiez que PAXITY_API_KEY et "
            "PAXITY_API_TOKEN sont corrects, actifs, et que votre compte marchand "
            "est activé (une autorisation d'IP peut être requise côté Paxity)."
        )
    if status_code == 404:
        return "Endpoint Paxity introuvable (404). Vérifiez PAXITY_BASE_URL."
    if status_code == 429:
        return "Trop de requêtes vers Paxity (429). Réessayez dans un instant."
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
    phone: Optional[str] = None
    address: Optional[str] = None


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
    payment_method: str  # OMSN | WAVESN | OMCI | WAVECI | MTNCI
    otp_code: Optional[str] = None
    description: str = "Commande Shopping en Chine"
    currency: Optional[str] = None  # override PAXITY_DEFAULT_CURRENCY if provided
    delivery_mode: Optional[str] = "standard"  # standard (économique) | express
    customer: PaxityCustomer
    items: list[PaxityOrderItem] = []


class PaxityCardInitRequest(BaseModel):
    """Initialisation d'un paiement CARTE via le widget Paxity.

    Le widget (card-widget.iife.js) gère lui-même l'appel à Paxity côté
    navigateur ; le backend crée d'abord la commande et la transaction, puis
    renvoie les paramètres nécessaires au widget (idClient = n° de commande,
    IPN, credentials marchands).
    """
    amount: float
    currency: Optional[str] = None
    description: str = "Commande Shopping en Chine"
    delivery_mode: Optional[str] = "standard"
    payment_method: str = "CARD"
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

    # 2) HTTP reachability + auth via the read-only balance endpoint. This
    #    confirms our keys work WITHOUT creating a real transaction (posting to
    #    pay-in-mobile would generate a genuine PENDING payment each call).
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{PAXITY_BASE_URL}{PAXITY_BALANCE_PATH}",
                headers=_headers() if PAXITY_CONFIGURED else None,
            )
            result["http_reachable"] = True
            result["http_status"] = resp.status_code
            result["response_preview"] = (resp.text or "")[:300]
    except Exception as e:
        result["http_error"] = f"{type(e).__name__}: {e}"
    result["latency_ms"] = int((time.monotonic() - started) * 1000)

    # 3) Auth test — the balance call above IS the auth test (200 = keys OK,
    #    401/403 = keys wrong). Surface a merchant-friendly summary.
    if result["http_reachable"] and PAXITY_CONFIGURED:
        result["auth_test_status"] = result["http_status"]
        result["auth_test_body"] = result["response_preview"]

    return result


# ---------------------------------------------------------------------------
# PayIn helpers — create_payin est découpé en étapes courtes et testables
# ---------------------------------------------------------------------------

def _require_paxity_configured() -> None:
    """503 explicite si les clés Paxity manquent dans backend/.env."""
    if PAXITY_CONFIGURED:
        return
    missing = [
        name for name, val in (
            ("PAXITY_API_KEY", PAXITY_API_KEY),
            ("PAXITY_API_TOKEN", PAXITY_API_TOKEN),
            ("PAXITY_BASE_URL", PAXITY_BASE_URL),
        ) if not val
    ]
    raise HTTPException(
        status_code=503,
        detail=(
            f"Paxity n'est pas configuré. Ajoutez {', '.join(missing)} dans "
            "backend/.env puis redémarrez le serveur."
        ),
    )


def _validate_payin(payload: PaxityPayinRequest) -> dict:
    """Valide méthode, montant et OTP ; renvoie les métadonnées de la méthode."""
    if payload.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Méthode de paiement inconnue : {payload.payment_method}")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    method_meta = PAYMENT_METHODS[payload.payment_method]
    if method_meta.get("requires_otp") and not (payload.otp_code or "").strip():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Un code OTP est requis pour {method_meta['label']}. "
                "Composez le code de validation sur votre téléphone avant de payer."
            ),
        )
    return method_meta


async def _persist_order(db: AsyncIOMotorDatabase, order_id: str, payload: PaxityPayinRequest,
                         tx: "PaxityTransaction", currency: str, is_test: bool = False) -> None:
    """Persist the order first (source of truth even if Paxity is down)."""
    try:
        await db.orders.insert_one({
            "id": order_id,
            "is_test": is_test,
            "customer": payload.customer.model_dump(),
            "items": [it.model_dump() for it in payload.items],
            "amount": payload.amount,
            "currency": currency,
            "status": "pending",
            "payment_method": payload.payment_method,
            "delivery_mode": getattr(payload, "delivery_mode", None) or "standard",
            "transaction_id": tx.id,
            "created_at": tx.created_at.isoformat(),
            "tracking_step": "ordered",
            "tracking_history": [{"step": "ordered", "at": tx.created_at.isoformat()}],
        })
    except Exception:
        logger.exception("[Paxity] Mongo insert failed — continuing anyway")


def _build_payin_body(payload: PaxityPayinRequest, method_meta: dict, currency: str,
                      order_id: str, request: Request) -> dict:
    """Corps de la requête PayIn Paxity (payload propre, sans clés None)."""
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
    ipn_url = PAXITY_IPN_URL or _public_ipn_url(request)
    if ipn_url:
        body["ipn"] = ipn_url
    # URL de retour après paiement — attribut `redirectUrl` confirmé par le
    # support Paxity (absent de leur doc publique). Après le paiement sur la
    # page Wave/OM/paxity.io, le client est redirigé vers notre page commande,
    # où la transaction en attente est restaurée et la confirmation s'affiche.
    # L'origine de la requête (site appelant) garantit la bonne URL par
    # environnement (prod : https://shoppingenchine.com) ; repli sur FRONTEND_URL.
    redirect_base = (request.headers.get("origin") or os.environ.get("FRONTEND_URL", "")).rstrip("/")
    if redirect_base.startswith("http"):
        body["redirectUrl"] = f"{redirect_base}/commande"
    # Drop keys that resolved to None (e.g. country for CARD) so we send a clean payload
    return {k: v for k, v in body.items() if v is not None}


def _parse_payin_response(resp: Optional[httpx.Response]) -> dict:
    """Décode la réponse Paxity en dict, même si le corps n'est pas du JSON."""
    if resp is None:
        return {}
    try:
        data = resp.json() if resp.content else {}
        return data if isinstance(data, dict) else {"raw": data}
    except Exception:
        text_preview = (resp.text or "")[:500]
        logger.warning(f"[Paxity] Non-JSON response ({resp.status_code}): {text_preview!r}")
        return {"raw_text": text_preview}


def _hydrate_tx_from_response(tx: "PaxityTransaction", data: dict) -> dict:
    """Copie les champs Paxity (id, référence, lien, QR) dans la transaction."""
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
    return root


async def _mark_payin_failed(db: AsyncIOMotorDatabase, tx: "PaxityTransaction",
                             order_id: str, log_context: str) -> None:
    """Marque transaction + commande en échec (écriture best-effort)."""
    tx.status = "failed"
    try:
        await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
        await db.orders.update_one({"id": order_id}, {"$set": {"status": "failed"}})
    except Exception:
        logger.exception(f"[Paxity] Mongo write failed on {log_context} path")


async def _finalize_order_number(db: AsyncIOMotorDatabase, order_id: str) -> str:
    """Attribue le numéro de commande définitif AU PAIEMENT CONFIRMÉ.

    Les commandes sont créées avec un id temporaire (tmp_xxx) : le compteur
    séquentiel n'est consommé que pour les paiements réussis, afin d'obtenir
    des numéros consécutifs (#1219, #1220, …) sans trous dus aux tentatives
    abandonnées. Idempotent (webhooks dupliqués).
    """
    if not str(order_id).startswith("tmp_"):
        return order_id
    # Commande créée en preview/localhost → numéro TEST-xxx (compteur séparé)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0, "is_test": 1})
    if order and order.get("is_test"):
        new_no = await next_test_order_number(db)
    else:
        new_no = await next_order_number(db)
    res = await db.orders.update_one({"id": order_id}, {"$set": {"id": new_no, "tmp_id": order_id}})
    if res.matched_count:
        await db.paxity_transactions.update_many({"order_id": order_id}, {"$set": {"order_id": new_no}})
        logger.info(f"[Paxity] Numéro de commande attribué : {order_id} → {new_no}")
        return new_no
    # Déjà finalisée par un autre événement (webhook + polling) : relire
    doc = await db.orders.find_one({"tmp_id": order_id}, {"_id": 0, "id": 1})
    return doc["id"] if doc else order_id


async def _finalize_payin(db: AsyncIOMotorDatabase, tx: "PaxityTransaction", order_id: str) -> str:
    """Persiste le résultat 2xx : emails si succès, watcher serveur si en attente."""
    try:
        if tx.status == "success":
            # Succès immédiat (ex : OM avec OTP) : numéro définitif tout de suite
            order_id = await _finalize_order_number(db, order_id)
            tx.order_id = order_id
        await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
        await db.orders.update_one({"id": order_id}, {"$set": {"status": tx.status}})
        if tx.status == "success":
            await maybe_send_order_confirmation(db, order_id)
            await maybe_send_customer_confirmation(db, order_id)
        elif tx.status == "pending":
            # Filet de sécurité : confirmation côté serveur même si le client
            # ne revient jamais de Wave/OM (page paxity.io fermée).
            asyncio.create_task(_watch_pending_tx(db, tx.id))
    except Exception:
        logger.exception("[Paxity] Mongo write failed on success path")
    return order_id


@router.post("/payin")
async def create_payin(payload: PaxityPayinRequest, request: Request):
    """
    Initiate a Paxity PayIn (customer pays merchant).

    IMPORTANT: Every step returns a proper JSON error instead of crashing the
    process and triggering a Cloudflare 520/521 in front of the app.
    """
    _require_paxity_configured()
    method_meta = _validate_payin(payload)
    currency = (payload.currency or PAXITY_DEFAULT_CURRENCY).upper()

    db = _db(request)
    # Id temporaire : le numéro séquentiel n'est attribué qu'au paiement confirmé
    order_id = f"tmp_{uuid.uuid4().hex[:10]}"

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

    await _persist_order(db, order_id, payload, tx, currency, _is_test_env(request))

    body = _build_payin_body(payload, method_meta, currency, order_id, request)
    logger.info(
        f"[Paxity] PayIn request order={order_id} amount={payload.amount} "
        f"currency={currency} method={payload.payment_method} body={_redact(body)}"
    )

    # ---- Robust Paxity call with retry ----
    resp, transport_error = await _post_with_retry(
        f"{PAXITY_BASE_URL}{PAXITY_PAYIN_PATH}",
        _headers(),
        body,
    )
    data = _parse_payin_response(resp)
    root = _hydrate_tx_from_response(tx, data)

    # Transport failure (all retries exhausted)
    if transport_error or resp is None:
        await _mark_payin_failed(db, tx, order_id, "error")
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
        await _mark_payin_failed(db, tx, order_id, "4xx")
        message = _extract_error_message(data, resp.status_code)
        logger.error(
            f"[Paxity] {resp.status_code} order={order_id} — request={_redact(body)} response={data}"
        )
        raise HTTPException(status_code=resp.status_code, detail=str(message))

    # 2xx — parse status with comprehensive mapping (status lives in nested data)
    raw_status = root.get("status") if root else None
    tx.status = _map_status(raw_status)
    await _finalize_payin(db, tx, order_id)

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
    """Poll the payment status (with a live refresh against Paxity while pending)."""
    db = _db(request)
    tx = await db.paxity_transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")

    # Live refresh: while pending, query Paxity for the real status so a
    # customer returning from Wave/Orange sees the confirmation immediately,
    # without needing the merchant webhook to be configured.
    await _refresh_pending_tx(db, tx)

    return {
        "transaction_id": tx["id"],
        "order_id": tx["order_id"],
        "status": tx["status"],
        "amount": tx["amount"],
        "currency": tx.get("currency", PAXITY_DEFAULT_CURRENCY),
        "updated_at": tx.get("updated_at"),
    }


async def _refresh_pending_tx(db: AsyncIOMotorDatabase, tx: dict) -> str:
    """
    Interroge Paxity pour le vrai statut d'une transaction pending,
    met à jour transaction + commande et envoie les emails de confirmation.
    Mutate `tx` en place et retourne le statut (possiblement rafraîchi).
    """
    if tx.get("status") != "pending" or not tx.get("paxity_transaction_id") or not PAXITY_CONFIGURED:
        return tx.get("status", "pending")
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(
                f"{PAXITY_BASE_URL}{PAXITY_PAYIN_PATH}/{tx['paxity_transaction_id']}",
                headers=_headers(),
            )
        if r.status_code == 200:
            root = _payload_root(r.json())
            fresh = _map_status(root.get("status"))
            if fresh != tx["status"]:
                now = datetime.now(timezone.utc).isoformat()
                if fresh == "success":
                    # Numéro de commande définitif attribué au paiement confirmé
                    tx["order_id"] = await _finalize_order_number(db, tx["order_id"])
                await db.paxity_transactions.update_one(
                    {"id": tx["id"]},
                    {"$set": {"status": fresh, "updated_at": now}},
                )
                await db.orders.update_one(
                    {"id": tx["order_id"]}, {"$set": {"status": fresh}}
                )
                tx["status"] = fresh
                tx["updated_at"] = now
                logger.info(f"[Paxity] Status refreshed tx={tx['id']} -> {fresh}")
                if fresh == "success":
                    await maybe_send_order_confirmation(db, tx["order_id"])
                    await maybe_send_customer_confirmation(db, tx["order_id"])
    except Exception:
        logger.warning("[Paxity] Live status refresh failed", exc_info=True)
    return tx.get("status", "pending")


async def _watch_pending_tx(db: AsyncIOMotorDatabase, tx_id: str):
    """
    Filet de sécurité serveur : après un paiement Wave/OM, le client peut ne
    jamais revenir sur le site (bloqué/fermé sur la page de retour paxity.io).
    Cette tâche vérifie le statut auprès de Paxity toutes les 20 s pendant
    15 minutes : la commande est confirmée et les emails partent même sans
    retour navigateur ni IPN.
    """
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
    logger.info(f"[Paxity] Watcher timeout tx={tx_id} (toujours pending après 15 min)")


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

    # Try to find by paxity id first, then by order id (le widget carte crée la
    # transaction côté serveur AVANT que Paxity n'attribue son transactionId :
    # si l'ID Paxity est inconnu, on retombe sur idClient = numéro de commande).
    result = None
    if paxity_tx_id:
        result = await db.paxity_transactions.update_one(
            {"paxity_transaction_id": paxity_tx_id}, {"$set": update}
        )
    if (result is None or result.matched_count == 0) and order_id:
        update_by_order = dict(update)
        if paxity_tx_id:
            update_by_order["paxity_transaction_id"] = paxity_tx_id
        result = await db.paxity_transactions.update_one(
            {"order_id": order_id}, {"$set": update_by_order}
        )

    if result is not None and result.matched_count:
        if not order_id:
            tx_doc = await db.paxity_transactions.find_one(
                {"paxity_transaction_id": paxity_tx_id}, {"_id": 0, "order_id": 1}
            )
            order_id = (tx_doc or {}).get("order_id")
        if order_id:
            if normalized == "success":
                # Numéro de commande définitif attribué au paiement confirmé
                order_id = await _finalize_order_number(db, order_id)
            await db.orders.update_one({"id": order_id}, {"$set": {"status": normalized}})
            if normalized == "success":
                await maybe_send_order_confirmation(db, order_id)
                await maybe_send_customer_confirmation(db, order_id)

    return {"received": True}


@router.post("/card/init")
async def init_card_payment(payload: PaxityCardInitRequest, request: Request):
    """Prépare un paiement carte via le widget Paxity.

    Crée la commande + la transaction (pending), puis renvoie au frontend les
    paramètres d'ouverture du widget. La confirmation arrive ensuite par IPN
    (idClient = n° de commande) et le polling existant affiche la confirmation.
    """
    _require_paxity_configured()
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    currency = (payload.currency or PAXITY_DEFAULT_CURRENCY).upper()

    db = _db(request)
    # Id temporaire : le numéro séquentiel n'est attribué qu'au paiement confirmé
    order_id = f"tmp_{uuid.uuid4().hex[:10]}"
    tx = PaxityTransaction(
        order_id=order_id,
        amount=payload.amount,
        currency=currency,
        payment_method="CARD",
        phone_number="",
        prefix_phone="",
        customer_name=payload.customer.name,
        customer_email=payload.customer.email,
        description=payload.description,
    )
    await _persist_order(db, order_id, payload, tx, currency, _is_test_env(request))
    try:
        await db.paxity_transactions.insert_one(tx.model_dump(mode="json"))
    except Exception:
        logger.exception("[Paxity] Mongo insert failed (card tx)")

    ipn_url = PAXITY_IPN_URL or _public_ipn_url(request)
    logger.info(f"[Paxity] Card widget init order={order_id} amount={payload.amount} {currency}")
    return {
        "order_id": order_id,
        "transaction_id": tx.id,
        "status": "pending",
        "amount": int(payload.amount),
        "currency": currency,
        "country": "SN",
        "ipn": ipn_url,
        "credentials": {"apikey": PAXITY_API_KEY, "apiToken": PAXITY_API_TOKEN},
    }


@router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    """Fetch order details by id."""
    db = _db(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order
