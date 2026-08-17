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

import asyncio
import base64
import hashlib
import io
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import Binary
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from PIL import Image
from pydantic import BaseModel, Field

from auth_router import get_current_seller

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/products", tags=["products"])

SEED_FILE = Path(__file__).parent / "seed_products.json"

# ---------------------------------------------------------------------------
# Stockage des images produit : les photos base64 (lourdes) sont converties en
# fichiers servis par l'API avec cache navigateur → catalogue ultra léger.
# ---------------------------------------------------------------------------
DATA_URI_RE = re.compile(r"^data:(image/[a-zA-Z0-9+.-]+);base64,(.+)$", re.DOTALL)
IMG_URL_RE = re.compile(r"^/api/products/([^/]+)/(?:img|thumb)/([a-f0-9]+)(\?v=\w+)?$")
IMG_CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}
THUMB_MAX = 480
THUMB_QUALITY = 70


def _make_thumb(data: bytes) -> bytes:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((THUMB_MAX, THUMB_MAX))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=THUMB_QUALITY)
    return out.getvalue()


def _thumb_url(url: str) -> str:
    m = IMG_URL_RE.match(url or "")
    if not m:
        return url or ""
    return f"/api/products/{m.group(1)}/thumb/{m.group(2)}{m.group(3) or ''}"


async def _store_image(db, product_id: str, src: str) -> Optional[str]:
    """data-URI → stocke bytes + miniature, renvoie l'URL API.
    Les URLs (http… ou déjà /api/…) sont renvoyées telles quelles."""
    if not src:
        return None
    m = DATA_URI_RE.match(src)
    if not m:
        return src
    ctype, b64 = m.groups()
    try:
        data = base64.b64decode(b64)
        thumb = _make_thumb(data)
    except Exception:
        logger.warning(f"[Products] Image illisible pour {product_id} — ignorée")
        return None
    image_id = uuid.uuid4().hex[:10]
    # Hash de contenu pour le versioning/cache-busting des images (non cryptographique)
    v = hashlib.sha256(data).hexdigest()[:8]
    await db.product_images.insert_one({
        "product_id": product_id,
        "image_id": image_id,
        "content_type": ctype,
        "data": Binary(data),
        "thumb": Binary(thumb),
        "v": v,
    })
    return f"/api/products/{product_id}/img/{image_id}?v={v}"


def _image_sources(doc: dict) -> tuple[list, list]:
    """Sources d'images du payload (max 5) + couleurs associées alignées."""
    srcs = doc.get("images") or ([doc["image"]] if doc.get("image") else [])
    colors = doc.get("image_colors") or []
    return srcs[:5], colors


async def _prune_orphan_images(db, product_id: str, stored: list) -> None:
    """Supprime les binaires d'images qui ne sont plus référencés."""
    keep_ids = [m.group(2) for m in (IMG_URL_RE.match(u) for u in stored) if m]
    await db.product_images.delete_many({"product_id": product_id, "image_id": {"$nin": keep_ids}})


async def decrement_stock_for_order(db, order_id: str) -> None:
    """Décrémente le stock des produits d'une commande PAYÉE — une seule fois
    par commande (drapeau atomique stock_decremented, comme les emails).
    stock=None = illimité (non touché) ; à 0 le produit passe automatiquement
    en rupture côté boutique (badge + boutons désactivés)."""
    order = await db.orders.find_one_and_update(
        {"id": order_id, "stock_decremented": {"$ne": True}},
        {"$set": {"stock_decremented": True}},
        projection={"_id": 0, "items": 1},
    )
    if not order:
        return
    for it in order.get("items") or []:
        pid = it.get("product_id")
        qty = int(it.get("qty") or 1)
        if not pid or qty <= 0:
            continue
        # Ne touche que les produits dont le stock est suivi (nombre)
        await db.products.update_one(
            {"id": pid, "stock": {"$type": "number"}},
            {"$inc": {"stock": -qty}},
        )
        # Jamais de stock négatif
        await db.products.update_one(
            {"id": pid, "stock": {"$lt": 0}},
            {"$set": {"stock": 0}},
        )


async def _process_images(db, product_id: str, doc: dict) -> None:
    """Convertit les images du payload en URLs stockées + nettoie les orphelines.
    Maintient l'alignement du tableau image_colors (couleur associée à chaque photo)."""
    srcs, colors = _image_sources(doc)
    stored, stored_colors = [], []
    for i, src in enumerate(srcs):
        url = await _store_image(db, product_id, src)
        if url:
            stored.append(url)
            stored_colors.append(colors[i] if i < len(colors) else None)
    doc["images"] = stored
    doc["image_colors"] = stored_colors if any(stored_colors) else None
    doc["image"] = _thumb_url(stored[0]) if stored else ""
    await _prune_orphan_images(db, product_id, stored)


async def migrate_base64_images(db) -> None:
    """Migration au démarrage : convertit les produits existants dont les photos
    sont encore en base64 (production incluse, au premier redéploiement)."""
    query = {"$or": [
        {"image": {"$regex": "^data:"}},
        {"images": {"$elemMatch": {"$regex": "^data:"}}},
    ]}
    count = 0
    async for p in db.products.find(query, {"_id": 0}):
        try:
            doc = {"images": p.get("images") or [p.get("image")], "image": p.get("image", "")}
            await _process_images(db, p["id"], doc)
            await db.products.update_one(
                {"id": p["id"]}, {"$set": {"images": doc["images"], "image": doc["image"]}}
            )
            count += 1
        except Exception:
            logger.warning(f"[Products] Migration image échouée pour {p.get('id')}", exc_info=True)
        await asyncio.sleep(0)  # ne bloque pas l'event loop
    if count:
        logger.info(f"[Products] Migration images : {count} produits convertis en URLs légères")


def _db(request: Request):
    return request.app.state.db


async def seed_products(db) -> None:
    """Migration : les produits de démonstration sont retirés définitivement.
    Au démarrage, supprime tout produit de démo restant (ids du fichier seed,
    jamais les produits du vendeur qui ont des ids p_xxx)."""
    if not SEED_FILE.exists():
        return
    seeds = json.loads(SEED_FILE.read_text())
    seed_ids = [p["id"] for p in seeds]
    result = await db.products.delete_many({"id": {"$in": seed_ids}, "custom": {"$ne": True}})
    if result.deleted_count:
        logger.info(f"[Products] {result.deleted_count} produits de démo supprimés définitivement")


class ProductPayload(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str
    subcategory: Optional[str] = None
    images: Optional[list[str]] = None
    keywords: Optional[list[str]] = None
    price: float = Field(gt=0)
    oldPrice: Optional[float] = None
    # Prix affichés/débités pour l'Europe et les USA/Canada.
    # Facultatifs : à défaut, conversion automatique (9000 F = 17 EUR = 19 USD).
    priceEur: Optional[float] = Field(default=None, gt=0)
    priceUsd: Optional[float] = Field(default=None, gt=0)
    badge: Optional[str] = None
    image: str = ""
    description: str = ""
    colors: list[str] = []
    sizes: Optional[list[str]] = None
    image_colors: Optional[list[Optional[str]]] = None
    # Gestion du stock : quantité facultative (None = illimité) + rupture manuelle
    stock: Optional[int] = Field(default=None, ge=0)
    outOfStock: bool = False


@router.get("")
async def list_products(request: Request) -> dict:
    """Liste publique allégée : les galeries (base64 lourdes) sont exclues —
    la fiche produit charge la galerie complète via GET /products/{id}."""
    db = _db(request)
    items = await db.products.find({}, {"_id": 0, "images": 0}).sort("created_at", -1).to_list(500)
    return {"products": items, "count": len(items)}


@router.get("/{product_id}")
async def get_product(product_id: str, request: Request) -> dict:
    db = _db(request)
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    return doc


@router.get("/{product_id}/img/{image_id}")
async def get_product_image(product_id: str, image_id: str, request: Request):
    db = _db(request)
    doc = await db.product_images.find_one({"product_id": product_id, "image_id": image_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Image introuvable")
    return Response(content=bytes(doc["data"]), media_type=doc.get("content_type", "image/jpeg"),
                    headers=IMG_CACHE_HEADERS)


@router.get("/{product_id}/thumb/{image_id}")
async def get_product_thumb(product_id: str, image_id: str, request: Request):
    db = _db(request)
    doc = await db.product_images.find_one({"product_id": product_id, "image_id": image_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Image introuvable")
    return Response(content=bytes(doc["thumb"]), media_type="image/jpeg", headers=IMG_CACHE_HEADERS)


@router.post("", status_code=201)
async def create_product(payload: ProductPayload, request: Request, seller: dict = Depends(get_current_seller)):
    db = _db(request)
    doc = payload.model_dump()
    product_id = f"p_{uuid.uuid4().hex[:10]}"
    await _process_images(db, product_id, doc)
    doc.update({
        "id": product_id,
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
    existing = await db.products.find_one({"id": product_id}, {"_id": 0, "id": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    doc = payload.model_dump()
    await _process_images(db, product_id, doc)
    await db.products.update_one({"id": product_id}, {"$set": doc})
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    return doc


@router.delete("/{product_id}")
async def delete_product(product_id: str, request: Request, seller: dict = Depends(get_current_seller)):
    db = _db(request)
    doc = await db.products.find_one({"id": product_id}, {"_id": 0, "custom": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    await db.products.delete_one({"id": product_id})
    await db.product_images.delete_many({"product_id": product_id})
    # Produit du catalogue de départ (custom explicitement False) : on mémorise
    # sa suppression pour ne pas le re-seeder au démarrage.
    if doc.get("custom", True) == False:  # noqa: E712 — comparaison de valeur voulue (pas d'identité)
        await db.deleted_seed_products.update_one(
            {"product_id": product_id}, {"$set": {"product_id": product_id}}, upsert=True
        )
    return {"deleted": product_id}
