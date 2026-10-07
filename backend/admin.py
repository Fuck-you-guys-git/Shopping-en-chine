"""Seller area API: login, orders and products. Every route except /login needs the admin token.

Credentials live only in the environment (ADMIN_EMAIL / ADMIN_PASSWORD). The
token is a JWT signed with a key derived from the password, so changing the
password signs every existing session out.
"""
import asyncio
import hashlib
import hmac
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal, Optional

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, StringConstraints

from catalog import Product
from database import get_db
from orders import ORDER_STATUSES, Order
from settings import admin_credentials, admin_name

TOKEN_LIFETIME = timedelta(days=7)
# Slows password guessing: after this many failed logins within the window,
# every login attempt is refused until the window passes.
MAX_FAILURES = 10
FAILURE_WINDOW_SECONDS = 60

_failures: deque[float] = deque()

CategoryId = Literal["mode", "tech", "maison", "beaute", "enfants", "cuisine"]  # frontend/src/data/products.js
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

router = APIRouter(prefix="/admin", tags=["admin"])


def _configured() -> tuple[str, str]:
    creds = admin_credentials()
    if not creds:
        raise HTTPException(
            status_code=503,
            detail="Espace vendeur non configuré : ajoutez ADMIN_EMAIL et ADMIN_PASSWORD au serveur.",
        )
    return creds


def _token_key(password: str) -> bytes:
    return hmac.new(password.encode(), b"shopping-en-chine admin token", hashlib.sha256).digest()


def require_admin(authorization: str = Header(default="")) -> str:
    email, password = _configured()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Connexion requise.")
    try:
        claims = jwt.decode(token, _token_key(password), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expirée, reconnectez-vous.")
    if claims.get("sub") != email:
        raise HTTPException(status_code=401, detail="Session expirée, reconnectez-vous.")
    return email


class LoginRequest(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


@router.post("/login")
async def login(payload: LoginRequest):
    email, password = _configured()
    now = time.monotonic()
    while _failures and now - _failures[0] > FAILURE_WINDOW_SECONDS:
        _failures.popleft()
    if len(_failures) >= MAX_FAILURES:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans une minute.")

    email_ok = hmac.compare_digest(payload.email.strip().lower().encode(), email.encode())
    password_ok = hmac.compare_digest(payload.password.encode(), password.encode())
    if not (email_ok and password_ok):
        _failures.append(now)
        await asyncio.sleep(1)
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")

    expires = datetime.now(timezone.utc) + TOKEN_LIFETIME
    token = jwt.encode({"sub": email, "exp": expires}, _token_key(password), algorithm="HS256")
    return {"token": token, "email": email, "name": admin_name()}


@router.get("/me")
async def me(email: str = Depends(require_admin)):
    return {"email": email, "name": admin_name()}


# ---- Orders ----------------------------------------------------------------
class StatusUpdate(BaseModel):
    status: Literal[ORDER_STATUSES]


@router.get("/orders", response_model=list[Order])
async def list_orders(_: str = Depends(require_admin), db=Depends(get_db)):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.patch("/orders/{order_id}", response_model=Order)
async def update_order_status(order_id: str, payload: StatusUpdate, _: str = Depends(require_admin), db=Depends(get_db)):
    result = await db.orders.update_one({"id": order_id}, {"$set": {"status": payload.status}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


# ---- Products --------------------------------------------------------------
class ProductInput(BaseModel):
    name: Text
    category: CategoryId
    price: int = Field(gt=0)  # F CFA
    old_price: Optional[int] = Field(default=None, gt=0)
    description: str = Field(default="", max_length=2000)
    image: Text
    badge: Optional[str] = Field(default=None, max_length=40)
    colors: list[str] = Field(default=[], max_length=12)


@router.post("/products", response_model=Product, status_code=201)
async def create_product(payload: ProductInput, _: str = Depends(require_admin), db=Depends(get_db)):
    first = await db.products.find({}, {"position": 1}).sort("position", 1).limit(1).to_list(1)
    product = Product(id=f"p{uuid.uuid4().hex[:8]}", **payload.model_dump())
    # New products go first in the shop.
    position = (first[0]["position"] - 1) if first else 0
    await db.products.insert_one({**product.model_dump(), "position": position})
    return product


@router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, payload: ProductInput, _: str = Depends(require_admin), db=Depends(get_db)):
    result = await db.products.update_one({"id": product_id}, {"$set": payload.model_dump()})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(product_id: str, _: str = Depends(require_admin), db=Depends(get_db)):
    result = await db.products.delete_one({"id": product_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Produit introuvable")
