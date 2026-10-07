"""Product catalog. The backend owns product prices; the shop reads them from here."""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from database import get_db

SEED_FILE = Path(__file__).parent / "data" / "products.json"


class Product(BaseModel):
    # Responses use the frontend's `oldPrice` spelling; MongoDB's _id and the
    # internal `position` field are dropped.
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str
    name: str
    category: str
    price: int = Field(ge=0)  # F CFA (XOF has no decimals)
    old_price: Optional[int] = Field(default=None, ge=0, alias="oldPrice")
    rating: float = 0
    reviews: int = 0
    badge: Optional[str] = None
    image: str
    description: str = ""
    colors: list[str] = []


router = APIRouter(prefix="/products", tags=["catalog"])


async def seed_catalog(db) -> None:
    """Add seed products missing from the database. Existing products are never overwritten."""
    seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    for position, raw in enumerate(seed):
        product = Product.model_validate(raw)
        doc = {**product.model_dump(), "position": position}
        await db.products.update_one({"id": product.id}, {"$setOnInsert": doc}, upsert=True)


@router.get("", response_model=list[Product])
async def list_products(db=Depends(get_db)):
    return await db.products.find({}, {"_id": 0}).sort("position", 1).to_list(1000)


@router.get("/{product_id}", response_model=Product)
async def get_product(product_id: str, db=Depends(get_db)):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    return product
