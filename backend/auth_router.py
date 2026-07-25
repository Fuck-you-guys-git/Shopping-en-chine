"""
Seller authentication — JWT (Bearer + httpOnly cookies), bcrypt hashing,
idempotent admin seeding, brute-force lockout (5 fails = 15 min).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 12  # 12h — seller manages the shop from his phone
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _db(request: Request):
    return request.app.state.db


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(email: str) -> str:
    payload = {
        "sub": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


async def get_current_seller(request: Request) -> dict:
    """FastAPI dependency — cookie first, then Authorization: Bearer."""
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Type de jeton invalide")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée — reconnectez-vous")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Jeton invalide")
    db = _db(request)
    user = await db.users.find_one({"email": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user


async def seed_seller(db) -> None:
    """Idempotent: create the seller account or refresh the hash if .env changed."""
    email = os.environ.get("SELLER_EMAIL", "").strip().lower()
    password = os.environ.get("SELLER_PASSWORD", "")
    if not email or not password:
        logger.warning("[Auth] SELLER_EMAIL / SELLER_PASSWORD missing — no seller seeded")
        return
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "email": email,
            "password_hash": hash_password(password),
            "name": "Vendeur",
            "role": "seller",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"[Auth] Seller account seeded: {email}")
    elif not verify_password(password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": email}, {"$set": {"password_hash": hash_password(password)}}
        )
        logger.info(f"[Auth] Seller password refreshed from .env: {email}")


class LoginPayload(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(payload: LoginPayload, request: Request, response: Response):
    db = _db(request)
    email = payload.email.strip().lower()
    ip = (request.client.host if request.client else "?")
    identifier = f"{ip}:{email}"

    attempt = await db.login_attempts.find_one({"identifier": identifier})
    now = datetime.now(timezone.utc)
    if attempt and attempt.get("count", 0) >= MAX_ATTEMPTS:
        locked_at = datetime.fromisoformat(attempt["last_at"])
        if now - locked_at < timedelta(minutes=LOCKOUT_MINUTES):
            raise HTTPException(
                status_code=429,
                detail=f"Trop de tentatives. Réessayez dans {LOCKOUT_MINUTES} minutes.",
            )
        await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"last_at": now.isoformat()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    await db.login_attempts.delete_one({"identifier": identifier})
    token = create_access_token(email)
    response.set_cookie(
        key="access_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=ACCESS_TTL_MIN * 60, path="/",
    )
    return {
        "token": token,
        "user": {"email": email, "name": user.get("name", "Vendeur"), "role": user.get("role", "seller")},
    }


@router.get("/me")
async def me(request: Request):
    user = await get_current_seller(request)
    return user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}
