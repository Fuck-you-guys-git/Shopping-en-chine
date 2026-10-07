"""
Journal des emails + webhook de statut de livraison Resend.

- GET  /api/emails/log            (vendeur, JWT) : dernières tentatives d'envoi
  avec leur statut réel (sent → delivered / bounced / complained…).
- POST /api/emails/resend-webhook : appelé par Resend (à configurer sur
  https://resend.com/webhooks avec l'URL https://<domaine>/api/emails/resend-webhook)
  pour mettre à jour le statut de livraison de chaque email.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone

import resend
from fastapi import APIRouter, Depends, HTTPException, Request
from html import escape as html_escape
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from auth_router import get_current_seller

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/emails", tags=["emails"])

# Statuts « payé » tolérants (anciennes commandes incluses)
_PAID_STATUSES = ["success", "successful", "paid", "completed", "confirmed",
                  "ok", "done", "shipped", "customs", "delivery", "delivered"]


async def _customer_directory(db) -> list:
    """Carnet d'adresses : un client par email, depuis les commandes PAYÉES
    (les commandes de test sont exclues)."""
    pipeline = [
        {"$match": {"status": {"$in": _PAID_STATUSES},
                    "is_test": {"$ne": True},
                    "customer.email": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": {"$toLower": "$customer.email"},
            "name": {"$last": "$customer.name"},
            "orders": {"$sum": 1},
            "last_order_at": {"$max": "$created_at"},
        }},
        # La boîte des vraies commandes n'est JAMAIS un client
        {"$match": {"_id": {"$ne": "commands@shoppingenchine.com"}}},
        {"$sort": {"last_order_at": -1}},
    ]
    rows = await db.orders.aggregate(pipeline).to_list(5000)
    return [{"email": r["_id"], "name": r.get("name") or "", "orders": r["orders"],
             "last_order_at": r.get("last_order_at")} for r in rows]


@router.get("/customers")
async def list_customer_emails(request: Request,
                               seller: dict = Depends(get_current_seller)) -> dict:
    """Tous les emails des clients ayant commandé (dédupliqués)."""
    customers = await _customer_directory(_db(request))
    return {"customers": customers, "count": len(customers)}


class BroadcastPayload(BaseModel):
    subject: str
    message: str


@router.post("/broadcast")
async def broadcast_email(payload: BroadcastPayload, request: Request,
                          seller: dict = Depends(get_current_seller)) -> dict:
    """Email de masse en un clic à TOUS les clients ayant commandé."""
    from email_service import _send, _wrap
    subject = payload.subject.strip()
    message = payload.message.strip()
    if not subject or not message:
        raise HTTPException(status_code=400, detail="Sujet et message requis")
    customers = await _customer_directory(_db(request))
    if not customers:
        raise HTTPException(status_code=404, detail="Aucun client avec email")
    paragraphs = "".join(
        f'<p style="margin:0 0 12px;font-size:15px;color:#333;line-height:1.6;">{html_escape(line)}</p>'
        for line in message.splitlines() if line.strip()
    )
    inner = f"""
        <h1 style="margin:0 0 14px;font-size:20px;color:#1d1d1d;">{html_escape(subject)}</h1>
        {paragraphs}
    """
    sent, failed = 0, 0
    for c in customers:
        ok = await _send(c["email"], subject, _wrap(inner), "broadcast")
        sent += 1 if ok else 0
        failed += 0 if ok else 1
        await asyncio.sleep(0.6)  # respecte la limite de débit Resend (2 req/s)
    logger.info(f"[Email] Broadcast '{subject}' → sent={sent} failed={failed}")
    return {"sent": sent, "failed": failed, "total": len(customers)}

# Événements Resend → statut lisible
_EVENT_STATUS = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",  # marqué comme spam par le destinataire
    "email.opened": "opened",
    "email.clicked": "clicked",
}
# Un statut « final » ne doit pas être écrasé par un événement plus faible
_STATUS_RANK = {
    "send_failed": 0, "sent": 1, "delivery_delayed": 2,
    "delivered": 3, "opened": 4, "clicked": 5,
    "bounced": 6, "complained": 6,
}


def _db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# Événement Resend (last_event de GET /emails/{id}) → statut du journal
_LAST_EVENT_MAP = {
    "sent": "sent", "delivered": "delivered", "delivery_delayed": "delivery_delayed",
    "bounced": "bounced", "complained": "complained", "opened": "opened", "clicked": "clicked",
}


async def _refresh_pending_statuses(db: AsyncIOMotorDatabase, docs: list[dict]) -> None:
    """Rafraîchit depuis l'API Resend les emails encore « sent » (clé full access).

    Best-effort : si la clé est restreinte à l'envoi ou l'API indisponible,
    les statuts restent tels quels (le webhook Resend prend alors le relais).
    """
    if not os.environ.get("RESEND_API_KEY"):
        return
    pending = [d for d in docs if d.get("resend_id")
               and d.get("delivery_status") in ("sent", "delivery_delayed")][:15]
    failures = 0
    for d in pending:
        try:
            info = await asyncio.to_thread(resend.Emails.get, d["resend_id"])
            status = _LAST_EVENT_MAP.get((info or {}).get("last_event"))
            if status and status != d["delivery_status"]:
                d["delivery_status"] = status
                await db.email_log.update_one(
                    {"resend_id": d["resend_id"]},
                    {"$set": {"delivery_status": status,
                              "last_event_at": datetime.now(timezone.utc).isoformat()}},
                )
        except Exception as e:
            # Email d'une ancienne clé (404) : on passe au suivant.
            # Clé restreinte à l'envoi (401 systématique) : on abandonne après 3 échecs.
            logger.debug(f"[Email] statut Resend indisponible pour {d['resend_id']}: {e}")
            failures += 1
            if failures >= 3:
                break


@router.get("/log")
async def list_email_log(request: Request, limit: int = 50) -> dict:
    """Dernières tentatives d'envoi (réservé au vendeur connecté)."""
    await get_current_seller(request)
    limit = max(1, min(int(limit), 200))
    db = _db(request)
    docs = await db.email_log.find({}, {"_id": 0}).sort("at", -1).to_list(limit)
    await _refresh_pending_statuses(db, docs)
    return {"emails": docs}


def _should_skip_downgrade(existing: dict | None, status: str) -> bool:
    """N'écrase pas un statut plus « avancé » (ex : delivered après opened)."""
    return bool(
        existing
        and _STATUS_RANK.get(status, 0) < _STATUS_RANK.get(existing.get("delivery_status"), 0)
    )


def _build_status_update(etype: str, status: str, data: dict) -> dict:
    """Champs à écrire dans le journal pour cet événement Resend."""
    update = {
        "delivery_status": status,
        "last_event": etype,
        "last_event_at": datetime.now(timezone.utc).isoformat(),
    }
    bounce = data.get("bounce") or {}
    if bounce.get("message"):
        update["bounce_reason"] = bounce["message"]
    return update


async def _upsert_email_log(db, email_id: str, data: dict, update: dict) -> None:
    """Met à jour la ligne du journal ; la crée si l'email prédate le journal."""
    res = await db.email_log.update_one({"resend_id": email_id}, {"$set": update})
    if res.matched_count == 0:
        await db.email_log.insert_one({
            "tag": "unknown",
            "to": data.get("to") or [],
            "subject": data.get("subject", ""),
            "from": data.get("from", ""),
            "resend_id": email_id,
            "at": data.get("created_at") or datetime.now(timezone.utc).isoformat(),
            **update,
        })


@router.post("/resend-webhook")
async def resend_webhook(request: Request) -> dict:
    """Réception des événements de livraison Resend (delivered, bounced…)."""
    try:
        event = await request.json()
    except Exception:
        return {"status": "ignored"}
    etype = event.get("type", "")
    data = event.get("data") or {}
    email_id = data.get("email_id") or data.get("id")
    status = _EVENT_STATUS.get(etype)
    if not email_id or not status:
        return {"status": "ignored"}

    db = _db(request)
    existing = await db.email_log.find_one({"resend_id": email_id}, {"delivery_status": 1})
    if _should_skip_downgrade(existing, status):
        return {"status": "ok"}

    update = _build_status_update(etype, status, data)
    await _upsert_email_log(db, email_id, data, update)
    if status in ("bounced", "complained"):
        bounce = data.get("bounce") or {}
        logger.warning(f"[Email] {etype} pour {data.get('to')} (id={email_id}) — {bounce.get('message', '')}")
    return {"status": "ok"}
