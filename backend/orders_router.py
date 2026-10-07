"""
Seller orders — real orders created by the Paxity payin flow (db.orders).

GET  /api/orders               -> list all orders (seller auth required)
GET  /api/orders/export.csv    -> CSV export (Paxity only, Stripe excluded)
GET  /api/orders/missing-confirmations -> paid orders never confirmed by email
POST /api/orders/resend-confirmations  -> resend those confirmations (client + merchant)
PUT  /api/orders/bulk-tracking -> set the tracking step of many orders at once
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from pymongo import ReturnDocument

from auth_router import get_current_seller
from email_service import maybe_send_customer_confirmation, maybe_send_order_confirmation
from orders_export import build_orders_csv, export_filename
from tracking_router import TRACKING_STEPS, STEP_LABELS

router = APIRouter(prefix="/orders", tags=["orders"])


async def next_order_number(db) -> str:
    """Numéro de commande séquentiel et lisible : 1000, 1001, 1002…
    Compteur atomique en base (db.counters) — pas de doublon possible."""
    doc = await db.counters.find_one_and_update(
        {"_id": "order_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return str(999 + doc["seq"])


async def next_test_order_number(db) -> str:
    """Numéro de commande de TEST (environnement de preview) : TEST-101, TEST-102…
    Compteur séparé — ne consomme JAMAIS le compteur réel des vraies commandes."""
    doc = await db.counters.find_one_and_update(
        {"_id": "test_order_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"TEST-{100 + doc['seq']}"


class BulkTrackingUpdate(BaseModel):
    order_ids: list[str]
    step: str


@router.get("")
async def list_orders(request: Request) -> dict:
    """All real customer orders, newest first (seller dashboard)."""
    await get_current_seller(request)
    db = request.app.state.db
    orders = await db.orders.find(
        {}, {"_id": 0, "raw_response": 0}
    ).sort("created_at", -1).to_list(5000)
    return {"orders": orders}


@router.get("/export.csv")
async def export_orders_csv(request: Request):
    """Fichier CSV de toutes les commandes PAYÉES via Paxity (Stripe exclu),
    avec les totaux Carte bancaire / Mobile Money en fin de fichier."""
    await get_current_seller(request)
    db = request.app.state.db
    orders = await db.orders.find({}, {"_id": 0, "raw_response": 0}).to_list(20000)
    content, summary = build_orders_csv(orders)
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{export_filename()}"',
            "X-Export-Orders": str(summary["orders"]),
            "X-Export-Card-Total": str(summary["card_total"]),
            "X-Export-Mobile-Total": str(summary["mobile_total"]),
            "X-Export-Grand-Total": str(summary["grand_total"]),
            "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Orders, X-Export-Card-Total, X-Export-Mobile-Total, X-Export-Grand-Total",
        },
    )


PAID_STATUSES_LIST = [
    "success", "successful", "paid", "completed", "confirmed", "ok", "done",
    "shipped", "customs", "delivery", "delivered",
]


def _missing_confirmation_query() -> dict:
    """Commandes PAYÉES dont au moins un des deux emails de confirmation
    n'est jamais parti (client ou marchand)."""
    return {
        "status": {"$in": PAID_STATUSES_LIST},
        "$or": [
            {"customer_email_sent": {"$ne": True}},
            {"confirmation_email_sent": {"$ne": True}},
        ],
    }


@router.get("/missing-confirmations")
async def list_missing_confirmations(request: Request) -> dict:
    """Aperçu AVANT envoi : qui n'a jamais reçu sa confirmation de commande."""
    await get_current_seller(request)
    db = request.app.state.db
    docs = await db.orders.find(
        _missing_confirmation_query(),
        {"_id": 0, "id": 1, "customer": 1, "amount": 1, "currency": 1,
         "created_at": 1, "customer_email_sent": 1, "confirmation_email_sent": 1},
    ).sort("created_at", -1).to_list(500)
    orders = [{
        "id": d.get("id"),
        "name": (d.get("customer") or {}).get("name") or "",
        "email": (d.get("customer") or {}).get("email") or "",
        "amount": d.get("amount"),
        "currency": d.get("currency", "XOF"),
        "created_at": d.get("created_at"),
        "customer_missing": d.get("customer_email_sent") is not True,
        "merchant_missing": d.get("confirmation_email_sent") is not True,
    } for d in docs]
    return {"count": len(orders), "orders": orders}


@router.post("/resend-confirmations")
async def resend_confirmations(request: Request) -> dict:
    """Renvoie les confirmations manquantes : email au CLIENT + notification
    au MARCHAND pour chaque commande payée qui n'en a jamais reçu.

    Les deux fonctions d'envoi réclament leur drapeau atomiquement : un client
    déjà notifié ne peut PAS recevoir de doublon, même en cas de double clic.
    """
    await get_current_seller(request)
    db = request.app.state.db
    docs = await db.orders.find(_missing_confirmation_query(), {"_id": 0, "id": 1}).to_list(500)

    customer_sent = merchant_sent = customer_failed = 0
    for d in docs:
        oid = d.get("id")
        if not oid:
            continue
        # Un envoi client était-il dû pour cette commande ?
        due = await db.orders.count_documents({
            "id": oid, "customer_email_sent": {"$ne": True},
            "customer.email": {"$nin": [None, ""]},
        })
        if await maybe_send_customer_confirmation(db, oid):
            customer_sent += 1
        elif due:
            customer_failed += 1
        if await maybe_send_order_confirmation(db, oid):
            merchant_sent += 1

    return {
        "orders": len(docs),
        "customer_sent": customer_sent,
        "customer_failed": customer_failed,
        "merchant_sent": merchant_sent,
    }


@router.put("/bulk-tracking")
async def bulk_update_tracking(payload: BulkTrackingUpdate, request: Request) -> dict:
    """Set the tracking step for several orders in one call (seller auth)."""
    await get_current_seller(request)
    if payload.step not in TRACKING_STEPS:
        raise HTTPException(
            status_code=400,
            detail=f"Étape inconnue : {payload.step}. Étapes valides : {', '.join(TRACKING_STEPS)}",
        )
    if not payload.order_ids:
        raise HTTPException(status_code=400, detail="Aucune commande sélectionnée.")

    db = request.app.state.db
    now = datetime.now(timezone.utc).isoformat()
    result = await db.orders.update_many(
        {"id": {"$in": payload.order_ids}},
        {
            "$set": {"tracking_step": payload.step, "tracking_updated_at": now},
            "$push": {"tracking_history": {"step": payload.step, "at": now}},
        },
    )
    # Notify customers (fire and forget, max 50)
    import asyncio
    from email_service import send_tracking_update
    orders = await db.orders.find(
        {"id": {"$in": payload.order_ids[:50]}}, {"_id": 0, "id": 1, "customer": 1}
    ).to_list(50)
    for o in orders:
        asyncio.create_task(send_tracking_update(o, STEP_LABELS[payload.step]))
    return {
        "updated": result.modified_count,
        "matched": result.matched_count,
        "step": payload.step,
        "label": STEP_LABELS[payload.step],
        "updated_at": now,
    }
