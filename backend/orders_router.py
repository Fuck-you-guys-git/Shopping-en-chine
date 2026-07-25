"""
Seller orders — real orders created by the Paxity payin flow (db.orders).

GET  /api/orders               -> list all orders (seller auth required)
PUT  /api/orders/bulk-tracking -> set the tracking step of many orders at once
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from auth_router import get_current_seller
from tracking_router import TRACKING_STEPS, STEP_LABELS

router = APIRouter(prefix="/orders", tags=["orders"])


class BulkTrackingUpdate(BaseModel):
    order_ids: list[str]
    step: str


@router.get("")
async def list_orders(request: Request):
    """All real customer orders, newest first (seller dashboard)."""
    await get_current_seller(request)
    db = request.app.state.db
    orders = await db.orders.find(
        {}, {"_id": 0, "raw_response": 0}
    ).sort("created_at", -1).to_list(500)
    return {"orders": orders}


@router.put("/bulk-tracking")
async def bulk_update_tracking(payload: BulkTrackingUpdate, request: Request):
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
    return {
        "updated": result.modified_count,
        "matched": result.matched_count,
        "step": payload.step,
        "label": STEP_LABELS[payload.step],
        "updated_at": now,
    }
