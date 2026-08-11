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
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from email_service import maybe_send_order_confirmation, maybe_send_customer_confirmation
from orders_router import next_order_number

logger = logging.getLogger(__name__)

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

router = APIRouter(tags=["stripe"])

# Taux commerciaux fixés par le marchand (devise principale : F CFA)
# 1 USD = 1000 F CFA · 1 EUR = 1260 F CFA
RATES_XOF = {"XOF": 1.0, "USD": 1000.0, "EUR": 1260.0}


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


@router.post("/payments/stripe/checkout")
async def create_stripe_checkout(payload: StripeCheckoutRequest, request: Request):
    db = _db(request)

    # Devise de paiement : le client européen paie en EUR, l'américain en USD,
    # les autres en F CFA. Les prix restent définis en F CFA (devise principale).
    cur = (payload.currency or "XOF").upper()
    if cur not in RATES_XOF:
        cur = "XOF"
    rate = RATES_XOF[cur]

    # Server-side pricing from the catalog
    line_items = []
    order_items = []
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
        if cur == "XOF":
            unit_amount = price  # XOF : zéro décimale, francs entiers
        else:
            unit_amount = int(round(price / rate * 100))  # EUR/USD : centimes
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

    order_id = await next_order_number(db)
    now = datetime.now(timezone.utc).isoformat()

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
            session = stripe.checkout.Session.create(
                **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required",
            )
        except stripe.error.InvalidRequestError as e:
            logger.warning(f"[Stripe] automatic_tax refused ({e.user_message}) — retrying without")
            session = stripe.checkout.Session.create(**kwargs)
    except stripe.error.StripeError as e:
        logger.exception("[Stripe] Session create failed")
        raise HTTPException(status_code=502, detail=f"Paiement carte indisponible : {getattr(e, 'user_message', None) or 'erreur Stripe'}")

    # Persist order (source of truth) + transaction BEFORE redirect
    await db.orders.insert_one({
        "id": order_id,
        "customer": payload.customer.model_dump(),
        "items": order_items,
        "amount": amount,
        "currency": "XOF",
        "charged_currency": cur,
        "charged_amount": charged_amount,
        "status": "pending",
        "payment_method": "CARD",
        "stripe_session_id": session.id,
        "created_at": now,
        "tracking_step": "ordered",
        "tracking_history": [{"step": "ordered", "at": now}],
    })
    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "order_id": order_id,
        "amount": amount,
        "currency": "xof",
        "charged_currency": cur,
        "charged_amount": charged_amount,
        "status": "initiated",
        "payment_status": "pending",
        "created_at": now,
        "updated_at": now,
    })
    return {
        "client_secret": session.client_secret,
        "checkout_url": session.url,
        "session_id": session.id,
        "order_id": order_id,
    }


async def _mark_paid(db, session_id: str, order_id: str | None = None):
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
        await maybe_send_order_confirmation(db, oid)
        await maybe_send_customer_confirmation(db, oid)


@router.get("/payments/stripe/status/{session_id}")
async def stripe_status(session_id: str, request: Request):
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
async def stripe_webhook(request: Request):
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
