"""
Order confirmation emails via Resend.

Sends a notification to the merchant (MERCHANT_EMAIL) when an order's
payment is confirmed. Idempotent: the caller flips `confirmation_email_sent`
atomically on the order document, so the email fires exactly once even if
the webhook and the live status poll race each other.
"""
from __future__ import annotations

import asyncio
import logging
import os

import resend
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
MERCHANT_EMAIL = os.environ.get("MERCHANT_EMAIL", "")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

EMAIL_ENABLED = bool(RESEND_API_KEY and MERCHANT_EMAIL)


def _fmt_price(amount) -> str:
    try:
        return f"{int(round(float(amount))):,}".replace(",", " ") + " F CFA"
    except Exception:
        return f"{amount} F CFA"


def _order_html(order: dict) -> str:
    customer = order.get("customer") or {}
    items = order.get("items") or []
    rows = "".join(
        f"""<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">{it.get('name', 'Article')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;text-align:center;">× {it.get('qty', 1)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;text-align:right;">{_fmt_price(it.get('price', 0))}</td>
        </tr>"""
        for it in items
    )
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#faf7f2;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1d1d1d;padding:20px 24px;">
            <span style="color:#ffffff;font-size:18px;font-weight:bold;">Shopping en Chine</span>
        </td></tr>
        <tr><td style="padding:24px;">
            <h1 style="margin:0 0 6px;font-size:20px;color:#1d1d1d;">Nouvelle commande payée ✔</h1>
            <p style="margin:0 0 16px;font-size:14px;color:#555;">
                Commande <strong>{order.get('id')}</strong> — paiement confirmé via {order.get('payment_method', 'Mobile Money')}.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;">
                {rows if rows else '<tr><td style="padding:12px;font-size:14px;color:#777;">Détail des articles indisponible</td></tr>'}
                <tr>
                    <td style="padding:12px;font-size:15px;font-weight:bold;color:#1d1d1d;" colspan="2">Total payé</td>
                    <td style="padding:12px;font-size:15px;font-weight:bold;color:#c64c3a;text-align:right;">{_fmt_price(order.get('amount', 0))}</td>
                </tr>
            </table>
            <h2 style="margin:20px 0 6px;font-size:15px;color:#1d1d1d;">Client</h2>
            <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
                {customer.get('name', '—')}<br/>
                {customer.get('email') or ''}{'<br/>' if customer.get('email') else ''}
                {customer.get('phone') or ''}{'<br/>' if customer.get('phone') else ''}
                {customer.get('address') or ''}{' — ' if customer.get('address') else ''}{customer.get('city') or ''}
            </p>
            <p style="margin:20px 0 0;font-size:12px;color:#999;">
                Pensez à mettre à jour le suivi : Commandé → Expédié de Chine → En douane → Livraison Dakar.
            </p>
        </td></tr>
    </table>
    """


async def maybe_send_order_confirmation(db: AsyncIOMotorDatabase, order_id: str) -> bool:
    """Send the merchant notification once per order. Returns True if sent."""
    if not EMAIL_ENABLED:
        return False
    # Atomically claim the send so concurrent webhook/poll calls can't duplicate
    order = await db.orders.find_one_and_update(
        {"id": order_id, "confirmation_email_sent": {"$ne": True}},
        {"$set": {"confirmation_email_sent": True}},
        projection={"_id": 0},
    )
    if not order:
        return False

    params = {
        "from": f"Shopping en Chine <{SENDER_EMAIL}>",
        "to": [MERCHANT_EMAIL],
        "subject": f"Nouvelle commande payée — {order.get('id')} ({_fmt_price(order.get('amount', 0))})",
        "html": _order_html(order),
    }
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"[Email] Order confirmation sent for {order_id} (id={email.get('id')})")
        return True
    except Exception:
        logger.exception(f"[Email] Failed to send confirmation for {order_id}")
        # Release the claim so a later status check can retry
        await db.orders.update_one(
            {"id": order_id}, {"$set": {"confirmation_email_sent": False}}
        )
        return False
