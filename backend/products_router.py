"""
Product catalog API — products live in MongoDB so items added by the seller
(from any device) are visible to every customer.

- GET  /api/products          public list
- POST /api/products          seller only (JWT)
- PUT  /api/products/{id}     seller only
- DELETE /api/products/{id}   seller only (seed products are tombstoned so
  startup re-seeding doesn't resurrect them)
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth_router import get_current_seller

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/products", tags=["products"])

SEED_FILE = Path(__file__).parent / "seed_products.json"


def _db(request: Request):
    return request.app.state.db


async def seed_products(db) -> None:
    """Idempotent: insert seed products missing from Mongo ($setOnInsert keeps
    seller edits), skipping any the seller deleted (tombstones)."""
    if not SEED_FILE.exists():
        logger.warning("[Products] seed_products.json missing — no seeding")
        return
    seeds = json.loads(SEED_FILE.read_text())
    tombstones = {d["product_id"] async for d in db.deleted_seed_products.find({}, {"_id": 0})}
    for p in seeds:
        if p["id"] in tombstones:
            continue
        await db.products.update_one(
            {"id": p["id"]},
            {"$setOnInsert": {**p, "custom": False, "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    count = await db.products.count_documents({})
    logger.info(f"[Products] Seeding done — {count} products in DB")


class ProductPayload(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str
    subcategory: Optional[str] = None
    images: Optional[list[str]] = None
    price: float = Field(gt=0)
    oldPrice: Optional[float] = None
    badge: Optional[str] = None
    image: str = ""
    description: str = ""
    colors: list[str] = []


@router.get("")
async def list_products(request: Request):
    db = _db(request)
    items = await db.products.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"products": items, "count": len(items)}


@router.post("", status_code=201)
async def create_product(payload: ProductPayload, request: Request, seller: dict = Depends(get_current_seller)):
    db = _db(request)
    doc = payload.model_dump()
    doc.update({
        "id": f"p_{uuid.uuid4().hex[:10]}",
        "rating": 5.0,
        "reviews": 0,
        "custom": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.products.insert_one({**doc})
    doc.pop("_id", None)
    logger.info(f"[Products] Created {doc['id']} by {seller['email']}")
    return doc


@router.put("/{product_id}")
async def update_product(product_id: str, payload: ProductPayload, request: Request, seller: dict = Depends(get_current_seller)):
    db = _db(request)
    res = await db.products.update_one({"id": product_id}, {"$set": payload.model_dump()})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    return doc


@router.delete("/{product_id}")
async def delete_product(product_id: str, request: Request, seller: dict = Depends(get_current_seller)):
    db = _db(request)
    doc = await db.products.find_one({"id": product_id}, {"_id": 0, "custom": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    await db.products.delete_one({"id": product_id})
    if doc.get("custom") is False:
        await db.deleted_seed_products.update_one(
            {"product_id": product_id}, {"$set": {"product_id": product_id}}, upsert=True
        )
    return {"deleted": product_id}
