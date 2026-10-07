"""
Avis clients VÉRIFIÉS.

- POST   /api/reviews                : un client laisse un avis — vérifié contre
  une commande PAYÉE (n° de commande + email de commande + produit acheté).
- GET    /api/reviews/{product_id}   : avis publics d'un produit (+ moyenne).
- DELETE /api/reviews/{review_id}    : modération vendeur (JWT).

La note moyenne et le nombre d'avis sont recopiés sur le produit
(products.rating / products.reviews) après chaque ajout/suppression.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth_router import get_current_seller

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reviews", tags=["reviews"])

# Statuts « payé » tolérants (mêmes règles que le carnet clients)
_PAID_STATUSES = ["success", "successful", "paid", "completed", "confirmed",
                  "ok", "done", "shipped", "customs", "delivery", "delivered"]


def _db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _normalize_order_id(raw: str) -> list[str]:
    """Formes acceptées pour retrouver la commande : « #1002 », « 1002 »,
    « TEST-101 », « ord_xxx » (anciens ids)."""
    oid = (raw or "").strip().lstrip("#")
    candidates = [oid]
    if oid and not oid.startswith(("ord_", "tmp_", "TEST-")):
        candidates.append(f"ord_{oid}")
    if oid.upper().startswith("TEST-"):
        candidates.append(oid.upper())
    return candidates


def _display_name(full_name: str) -> str:
    """« Fatou Diop » → « Fatou D. » (confidentialité)."""
    parts = [p for p in (full_name or "").strip().split() if p]
    if not parts:
        return "Client"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


class ReviewSubmit(BaseModel):
    product_id: str
    order_id: str = Field(min_length=1, max_length=40)
    email: str = Field(min_length=3, max_length=120)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


async def _sync_product_rating(db: AsyncIOMotorDatabase, product_id: str) -> None:
    """Recalcule note moyenne + nombre d'avis publics du produit."""
    pipeline = [
        {"$match": {"product_id": product_id, "is_test": {"$ne": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}},
    ]
    rows = await db.reviews.aggregate(pipeline).to_list(1)
    if rows:
        avg = round(float(rows[0]["avg"]), 1)
        count = int(rows[0]["count"])
    else:
        avg, count = 5.0, 0
    await db.products.update_one({"id": product_id}, {"$set": {"rating": avg, "reviews": count}})


@router.post("", status_code=201)
async def submit_review(payload: ReviewSubmit, request: Request) -> dict:
    """Dépose un avis — uniquement si l'acheteur est vérifié."""
    db = _db(request)
    email = payload.email.strip().lower()

    order = await db.orders.find_one(
        {"id": {"$in": _normalize_order_id(payload.order_id)}}, {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable. Vérifiez votre numéro de commande.")
    if ((order.get("customer") or {}).get("email") or "").strip().lower() != email:
        raise HTTPException(status_code=403, detail="Cet email ne correspond pas à la commande.")
    if (order.get("status") or "").lower() not in _PAID_STATUSES:
        raise HTTPException(status_code=403, detail="Seules les commandes payées peuvent laisser un avis.")
    if not any(it.get("product_id") == payload.product_id for it in (order.get("items") or [])):
        raise HTTPException(status_code=403, detail="Ce produit ne figure pas dans cette commande.")

    existing = await db.reviews.find_one(
        {"order_id": order["id"], "product_id": payload.product_id}, {"_id": 0, "id": 1}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Vous avez déjà laissé un avis pour ce produit avec cette commande.")

    review = {
        "id": f"rev_{uuid.uuid4().hex[:12]}",
        "product_id": payload.product_id,
        "order_id": order["id"],
        "rating": payload.rating,
        "comment": payload.comment.strip(),
        "author": _display_name((order.get("customer") or {}).get("name")),
        "verified": True,
        "is_test": bool(order.get("is_test")),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one({**review})
    await _sync_product_rating(db, payload.product_id)
    logger.info(f"[Reviews] Avis {review['id']} ({payload.rating}/5) sur {payload.product_id} — commande {order['id']}")
    public = {k: v for k, v in review.items() if k != "is_test"}
    return public


@router.get("/{product_id}")
async def list_reviews(product_id: str, request: Request) -> dict:
    """Avis publics d'un produit, du plus récent au plus ancien."""
    db = _db(request)
    rows = await db.reviews.find(
        {"product_id": product_id, "is_test": {"$ne": True}},
        {"_id": 0, "is_test": 0, "order_id": 0},
    ).sort("created_at", -1).to_list(200)
    count = len(rows)
    average = round(sum(r["rating"] for r in rows) / count, 1) if count else None
    return {"reviews": rows, "count": count, "average": average}


@router.delete("/{review_id}")
async def delete_review(review_id: str, request: Request,
                        seller: dict = Depends(get_current_seller)) -> dict:
    """Modération vendeur : supprime un avis puis resynchronise la note."""
    db = _db(request)
    doc = await db.reviews.find_one({"id": review_id}, {"_id": 0, "product_id": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Avis introuvable")
    await db.reviews.delete_one({"id": review_id})
    await _sync_product_rating(db, doc["product_id"])
    logger.info(f"[Reviews] Avis {review_id} supprimé par {seller['email']}")
    return {"deleted": review_id}
