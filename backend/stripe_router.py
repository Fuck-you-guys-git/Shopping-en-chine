"""
Stripe card payments — runs alongside Paxity mobile money.

POST /api/payments/stripe/checkout  -> create order + Stripe Checkout session
GET  /api/payments/stripe/status/{session_id} -> poll payment status
POST /api/stripe/webhook            -> Stripe webhook (checkout.session.completed...)

Amounts are computed SERVER-SIDE from db.products — the frontend never sends prices.
XOF is a zero-decimal currency: unit_amount is in whole francs.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from email_service import maybe_send_order_confirmation, maybe_send_customer_confirmation
from orders_router import next_order_number
from products_router import decrement_stock_for_order

logger = logging.getLogger(__name__)

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

router = APIRouter(tags=["stripe"])

# Barème fixé par le marchand : un produit à 9000 F CFA vaut 17 EUR et 19 USD.
# => EUR = CFA / (9000/17) ; USD = CFA / (9000/19)
RATES_XOF = {"XOF": 1.0, "USD": 9000.0 / 19.0, "EUR": 9000.0 / 17.0}


def _db(request: Request):
    return request.app.state.db


class StripeCustomer(BaseModel):
    name: str
    email: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class StripeItem(BaseModel):
    product_id: str
    qty: int = Field(1, ge=1, le=50)
    size: Optional[str] = None


class StripeCheckoutRequest(BaseModel):
    origin_url: str
    customer: StripeCustomer
    items: list[StripeItem] = Field(min_length=1)
    locale: Optional[str] = "fr"  # langue du formulaire Stripe (fr/en)
    currency: Optional[str] = "XOF"  # devise de PAIEMENT du client : XOF, EUR ou USD
    delivery_mode: Optional[str] = "standard"  # standard (économique) | express


def _unit_amount_for(product: dict, price_xof: int, cur: str, rate: float) -> int:
    """Montant unitaire en unité mineure de la devise (francs XOF ou centimes)."""
    if cur == "XOF":
        return price_xof  # XOF : zéro décimale, francs entiers
    # Prix EUR/USD saisi par le vendeur prioritaire, sinon conversion au barème
    explicit = product.get("priceEur") if cur == "EUR" else product.get("priceUsd")
    if explicit and float(explicit) > 0:
        return int(round(float(explicit) * 100))  # centimes
    return int(round(price_xof / rate * 100))  # EUR/USD : centimes


async def _build_stripe_lines(db, payload: StripeCheckoutRequest, cur: str, rate: float) -> tuple:
    """Tarification côté serveur depuis le catalogue.

    Renvoie (line_items Stripe, order_items en base, total XOF, total débité).
    """
    line_items, order_items = [], []
    amount = 0          # total en F CFA (devise principale, stocké en base)
    charged_minor = 0   # total débité, en unité mineure de la devise (centimes ou francs)
    for it in payload.items:
        product = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=400, detail=f"Produit introuvable : {it.product_id}")
        price = int(round(float(product["price"])))
        amount += price * it.qty
        item_name = f"{product['name']} — Taille {it.size}" if it.size else product["name"]
        order_items.append({"product_id": it.product_id, "name": item_name, "price": price, "qty": it.qty})
        unit_amount = _unit_amount_for(product, price, cur, rate)
        charged_minor += unit_amount * it.qty
        line_items.append({
            "price_data": {
                "currency": cur.lower(),
                "product_data": {"name": item_name},
                "unit_amount": unit_amount,
            },
            "quantity": it.qty,
        })
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide.")
    charged_amount = charged_minor if cur == "XOF" else round(charged_minor / 100, 2)
    return line_items, order_items, amount, charged_amount


def _create_stripe_session(payload: StripeCheckoutRequest, line_items: list, order_id: str):
    """Crée la session Stripe embarquée (retente sans automatic_tax si refusé)."""
    kwargs = dict(
        line_items=line_items,
        mode="payment",
        ui_mode="embedded",  # paiement intégré : le client ne quitte pas le site
        locale=payload.locale if payload.locale in ("fr", "en") else "fr",  # formulaire Stripe dans la langue du client
        return_url=f"{payload.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        metadata={"order_id": order_id},
    )
    try:
        try:
            return stripe.checkout.Session.create(
                **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required",
            )
        except stripe.error.InvalidRequestError as e:
            logger.warning(f"[Stripe] automatic_tax refused ({e.user_message}) — retrying without")
            return stripe.checkout.Session.create(**kwargs)
    except stripe.error.StripeError as e:
        logger.exception("[Stripe] Session create failed")
        raise HTTPException(status_code=502, detail=f"Paiement carte indisponible : {getattr(e, 'user_message', None) or 'erreur Stripe'}")


@dataclass
class StripeOrderData:
    """Regroupe les données de commande Stripe (évite 8 paramètres positionnels)."""
    order_id: str
    session_id: str
    order_items: list
    amount: int
    cur: str
    charged_amount: float


async def _persist_stripe_order(db, payload: StripeCheckoutRequest, data: StripeOrderData) -> None:
    """Persist order (source of truth) + transaction BEFORE redirect."""
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.insert_one({
        "id": data.order_id,
        "customer": payload.customer.model_dump(),
        "items": data.order_items,
        "amount": data.amount,
        "currency": "XOF",
        "charged_currency": data.cur,
        "charged_amount": data.charged_amount,
        "status": "pending",
        "payment_method": "CARD",
        "delivery_mode": payload.delivery_mode or "standard",
        "stripe_session_id": data.session_id,
        "created_at": now,
        "tracking_step": "ordered",
        "tracking_history": [{"step": "ordered", "at": now}],
    })
    await db.payment_transactions.insert_one({
        "session_id": data.session_id,
        "order_id": data.order_id,
        "amount": data.amount,
        "currency": "xof",
        "charged_currency": data.cur,
        "charged_amount": data.charged_amount,
        "status": "initiated",
        "payment_status": "pending",
        "created_at": now,
        "updated_at": now,
    })


@router.post("/payments/stripe/checkout")
async def create_stripe_checkout(payload: StripeCheckoutRequest, request: Request) -> dict:
    db = _db(request)

    # Devise de paiement : le client européen paie en EUR, l'américain en USD,
    # les autres en F CFA. Les prix restent définis en F CFA (devise principale).
    cur = (payload.currency or "XOF").upper()
    if cur not in RATES_XOF:
        cur = "XOF"
    rate = RATES_XOF[cur]

    line_items, order_items, amount, charged_amount = await _build_stripe_lines(db, payload, cur, rate)

    order_id = await next_order_number(db)
    session = _create_stripe_session(payload, line_items, order_id)
    await _persist_stripe_order(db, payload, StripeOrderData(
        order_id=order_id,
        session_id=session.id,
        order_items=order_items,
        amount=amount,
        cur=cur,
        charged_amount=charged_amount,
    ))

    return {
        "client_secret": session.client_secret,
        "checkout_url": session.url,
        "session_id": session.id,
        "order_id": order_id,
    }


async def _mark_paid(db, session_id: str, order_id: str | None = None) -> None:
    """Idempotent: flip transaction + order to paid, then send emails once."""
    res = await db.payment_transactions.find_one_and_update(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid",
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        projection={"_id": 0},
    )
    if not res:
        return  # already paid & emails sent
    oid = order_id or res.get("order_id")
    if oid:
        await db.orders.update_one({"id": oid}, {"$set": {"status": "success"}})
        await decrement_stock_for_order(db, oid)
        await maybe_send_order_confirmation(db, oid)
        await maybe_send_customer_confirmation(db, oid)


@router.get("/payments/stripe/status/{session_id}")
async def stripe_status(session_id: str, request: Request) -> dict:
    db = _db(request)
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_paid(db, session_id)
                record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
            elif s.status == "expired":
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {"status": "expired", "payment_status": "expired"}})
                record["status"] = "expired"
                record["payment_status"] = "expired"
        except stripe.error.StripeError:
            pass
    return {
        "session_id": record["session_id"],
        "status": record.get("status"),
        "payment_status": record.get("payment_status"),
        "order_id": record.get("order_id"),
    }


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request) -> dict:
    db = _db(request)
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if obj.get("payment_status") == "paid" or t.endswith("succeeded"):
            await _mark_paid(db, obj["id"], (obj.get("metadata") or {}).get("order_id"))
    elif t == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed"}})
        oid = (obj.get("metadata") or {}).get("order_id")
        if oid:
            await db.orders.update_one({"id": oid}, {"$set": {"status": "failed"}})
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired"}})
    return {"status": "ok"}
