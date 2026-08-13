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
from fastapi import APIRouter, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth_router import get_current_seller

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/emails", tags=["emails"])

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
async def list_email_log(request: Request, limit: int = 50):
    """Dernières tentatives d'envoi (réservé au vendeur connecté)."""
    await get_current_seller(request)
    limit = max(1, min(int(limit), 200))
    db = _db(request)
    docs = await db.email_log.find({}, {"_id": 0}).sort("at", -1).to_list(limit)
    await _refresh_pending_statuses(db, docs)
    return {"emails": docs}


@router.post("/resend-webhook")
async def resend_webhook(request: Request):
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
    doc = await db.email_log.find_one({"resend_id": email_id}, {"delivery_status": 1})
    # N'écrase pas un statut plus « avancé » (ex : delivered après opened)
    if doc and _STATUS_RANK.get(status, 0) < _STATUS_RANK.get(doc.get("delivery_status"), 0):
        return {"status": "ok"}

    update = {
        "delivery_status": status,
        "last_event": etype,
        "last_event_at": datetime.now(timezone.utc).isoformat(),
    }
    bounce = data.get("bounce") or {}
    if bounce.get("message"):
        update["bounce_reason"] = bounce["message"]
    res = await db.email_log.update_one({"resend_id": email_id}, {"$set": update})
    if res.matched_count == 0:
        # Email envoyé avant la mise en place du journal : on le trace quand même
        await db.email_log.insert_one({
            "tag": "unknown",
            "to": data.get("to") or [],
            "subject": data.get("subject", ""),
            "from": data.get("from", ""),
            "resend_id": email_id,
            "at": data.get("created_at") or datetime.now(timezone.utc).isoformat(),
            **update,
        })
    if status in ("bounced", "complained"):
        logger.warning(f"[Email] {etype} pour {data.get('to')} (id={email_id}) — {bounce.get('message', '')}")
    return {"status": "ok"}
