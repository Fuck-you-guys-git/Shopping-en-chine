"""
Order tracking — public "Où est mon colis ?" feature.

Steps (in order):
    ordered   -> Commandé
    shipped   -> Expédié de Chine
    customs   -> En douane
    delivery  -> En livraison à Dakar
    delivered -> Livré

Orders are created by the Paxity payin flow (db.orders). This router lets
customers look up progress by order number and lets the merchant advance
the step via PUT.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

TRACKING_STEPS = ["ordered", "shipped", "customs", "delivery", "delivered"]
STEP_LABELS = {
    "ordered": "Commandé",
    "shipped": "Expédié de Chine",
    "customs": "En douane",
    # Libellé générique : la ville du client (Dakar, Paris, New York…) est
    # ajoutée côté page de suivi et dans l'email (voir _delivery_label).
    "delivery": "En livraison",
    "delivered": "Livré",
}


def _delivery_label(order: dict) -> str:
    """« En livraison à {ville du client} » — international-friendly."""
    city = ((order or {}).get("customer") or {}).get("city") or ""
    return f"En livraison à {city}" if city else STEP_LABELS["delivery"]

# Delivery window in days (China -> Dakar)
ETA_MIN_DAYS = 10
ETA_MAX_DAYS = 20

router = APIRouter(prefix="/tracking", tags=["tracking"])


def _db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _normalize_order_id(raw: str) -> str:
    oid = (raw or "").strip().lstrip("#")
    # Nouveaux numéros de commande : purement numériques (1000, 1001…)
    if oid.isdigit():
        return oid
    # Commandes de TEST (preview) : TEST-101, TEST-102…
    if oid.upper().startswith("TEST-"):
        return oid.upper()
    # Anciens ids : tolère la saisie sans le préfixe "ord_"
    if oid and not oid.startswith("ord_"):
        oid = f"ord_{oid}"
    return oid


def _parse_created(order: dict) -> datetime:
    raw = order.get("created_at")
    try:
        dt = datetime.fromisoformat(str(raw))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


class TrackingUpdate(BaseModel):
    step: str


@router.get("/steps")
async def get_steps():
    """Ordered list of tracking steps with French labels (for UIs)."""
    return {"steps": [{"code": s, "label": STEP_LABELS[s]} for s in TRACKING_STEPS]}


@router.get("/{order_id}")
async def track_order(order_id: str, request: Request):
    """Public tracking lookup by order number."""
    db = _db(request)
    oid = _normalize_order_id(order_id)
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable. Vérifiez votre numéro de commande.")

    created = _parse_created(order)
    step = order.get("tracking_step") or "ordered"
    if step not in TRACKING_STEPS:
        step = "ordered"
    history = order.get("tracking_history") or [
        {"step": "ordered", "at": created.isoformat()}
    ]

    return {
        "order_id": order["id"],
        "created_at": created.isoformat(),
        "payment_status": order.get("status", "pending"),
        "amount": order.get("amount"),
        "currency": order.get("currency", "XOF"),
        "customer_name": (order.get("customer") or {}).get("name"),
        "city": (order.get("customer") or {}).get("city"),
        "items": [
            {"name": it.get("name"), "qty": it.get("qty", 1), "price": it.get("price")}
            for it in (order.get("items") or [])
        ],
        "tracking_step": step,
        "tracking_step_index": TRACKING_STEPS.index(step),
        "tracking_history": history,
        "steps": [{"code": s, "label": STEP_LABELS[s]} for s in TRACKING_STEPS],
        "eta_start": (created + timedelta(days=ETA_MIN_DAYS)).isoformat(),
        "eta_end": (created + timedelta(days=ETA_MAX_DAYS)).isoformat(),
        "delivered": step == "delivered",
    }


@router.put("/{order_id}")
async def update_tracking(order_id: str, payload: TrackingUpdate, request: Request):
    """Merchant endpoint — advance (or set) the tracking step of an order."""
    if payload.step not in TRACKING_STEPS:
        raise HTTPException(
            status_code=400,
            detail=f"Étape inconnue : {payload.step}. Étapes valides : {', '.join(TRACKING_STEPS)}",
        )
    db = _db(request)
    oid = _normalize_order_id(order_id)
    order = await db.orders.find_one({"id": oid}, {"_id": 0, "id": 1, "tracking_history": 1, "customer": 1})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable.")

    now = datetime.now(timezone.utc).isoformat()
    history = order.get("tracking_history") or []
    history.append({"step": payload.step, "at": now})

    await db.orders.update_one(
        {"id": oid},
        {"$set": {"tracking_step": payload.step, "tracking_history": history, "tracking_updated_at": now}},
    )
    # Notify the customer (fire and forget)
    import asyncio
    from email_service import send_tracking_update
    asyncio.create_task(send_tracking_update(
        order,
        _delivery_label(order) if payload.step == "delivery" else STEP_LABELS[payload.step],
    ))
    return {
        "order_id": oid,
        "tracking_step": payload.step,
        "label": STEP_LABELS[payload.step],
        "updated_at": now,
    }
