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
from datetime import datetime, timezone

import resend
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
# Destinataires marchands FIXÉS dans le code (demande explicite du marchand).
# Double destinataire : si la boîte commands@ a un souci, le Gmail reçoit quand même.
# Destinataire des notifications de commande (boîte marchande officielle)
MERCHANT_RECIPIENTS = ["commands@shoppingenchine.com"]
MERCHANT_EMAIL = MERCHANT_RECIPIENTS[0]
# Commandes de TEST (preview) : notification envoyée UNIQUEMENT au Gmail du
# vendeur — la boîte commands@ ne reçoit que les VRAIES commandes.
TEST_MERCHANT_RECIPIENTS = ["modou.ba.568@gmail.com"]

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

EMAIL_ENABLED = bool(RESEND_API_KEY and MERCHANT_EMAIL)


def _fmt_price(amount) -> str:
    try:
        return f"{int(round(float(amount))):,}".replace(",", " ") + " F CFA"
    except Exception:
        return f"{amount} F CFA"


def _order_no(order_id) -> str:
    """Numéro de commande affiché : #1000 (anciens ids ord_xxx inchangés)."""
    s = str(order_id or "")
    return f"#{s}" if (s.isdigit() or s.startswith("TEST-")) else s


def _test_tag(order) -> str:
    """Préfixe [TEST] pour les commandes de l'environnement de preview —
    évite toute confusion avec les vraies commandes dans la boîte mail."""
    oid = str((order or {}).get("id") or "")
    is_test = (order or {}).get("is_test") or oid.startswith(("TEST-", "tmp_"))
    return "[TEST] " if is_test else ""


def _items_rows_html(items: list, *, padding: str = "8px 12px", border: bool = True) -> str:
    """Lignes <tr> article/qté/prix, réutilisées par les emails marchand et client."""
    border_css = "border-bottom:1px solid #eee;" if border else ""
    cell = f"padding:{padding};{border_css}font-size:14px;color:#333;"
    return "".join(
        f"<tr><td style='{cell}'>{it.get('name', 'Article')}</td>"
        f"<td style='{cell}text-align:center;'>× {it.get('qty', 1)}</td>"
        f"<td style='{cell}text-align:right;'>{_fmt_price(it.get('price', 0))}</td></tr>"
        for it in items
    )


def _customer_block_html(customer: dict) -> str:
    """Bloc coordonnées client de l'email marchand."""
    return f"""
            <h2 style="margin:20px 0 6px;font-size:15px;color:#1d1d1d;">Client</h2>
            <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
                {customer.get('name', '—')}<br/>
                {customer.get('email') or ''}{'<br/>' if customer.get('email') else ''}
                {customer.get('phone') or ''}{'<br/>' if customer.get('phone') else ''}
                {customer.get('address') or ''}{' — ' if customer.get('address') else ''}{customer.get('city') or ''}
            </p>"""


def _order_html(order: dict) -> str:
    """Email marchand « Nouvelle commande payée » (en-tête + articles + client)."""
    customer = order.get("customer") or {}
    rows = _items_rows_html(order.get("items") or [])
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#faf7f2;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1d1d1d;padding:20px 24px;">
            <span style="color:#ffffff;font-size:18px;font-weight:bold;">Shopping en Chine</span>
        </td></tr>
        <tr><td style="padding:24px;">
            <h1 style="margin:0 0 6px;font-size:20px;color:#1d1d1d;">Nouvelle commande payée ✔</h1>
            <p style="margin:0 0 16px;font-size:14px;color:#555;">
                Commande <strong>{_order_no(order.get('id'))}</strong> — paiement confirmé via {order.get('payment_method', 'Mobile Money')}.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;">
                {rows if rows else '<tr><td style="padding:12px;font-size:14px;color:#777;">Détail des articles indisponible</td></tr>'}
                <tr>
                    <td style="padding:12px;font-size:15px;font-weight:bold;color:#1d1d1d;" colspan="2">Total payé</td>
                    <td style="padding:12px;font-size:15px;font-weight:bold;color:#c64c3a;text-align:right;">{_fmt_price(order.get('amount', 0))}</td>
                </tr>
            </table>
            {_customer_block_html(customer)}
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

    # Commande de test → Gmail vendeur ; vraie commande → commands@
    recipients = TEST_MERCHANT_RECIPIENTS if _test_tag(order) else MERCHANT_RECIPIENTS
    params = {
        "to": recipients,
        "subject": f"{_test_tag(order)}Nouvelle commande payée — {_order_no(order.get('id'))} ({_fmt_price(order.get('amount', 0))})",
        "html": _order_html(order),
    }
    try:
        email = await _send_raw(params, "merchant")
        logger.info(f"[Email] Order confirmation sent for {order_id} to={recipients} (id={email.get('id')})")
        return True
    except Exception:
        logger.exception(f"[Email] Failed to send confirmation for {order_id}")
        # Release the claim so a later status check can retry
        await db.orders.update_one(
            {"id": order_id}, {"$set": {"confirmation_email_sent": False}}
        )
        return False


# ---------------------------------------------------------------------------
# Customer-facing emails
# NOTE: Resend TEST MODE only delivers to the account owner's address.
# Verify the domain (resend.com/domains) to actually reach customers.
# ---------------------------------------------------------------------------
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")


def _wrap(inner: str) -> str:
    return f"""
    <div style="background:#f4f1ec;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <tr><td style="background:#1d1d1d;padding:28px 32px;text-align:center;">
            <div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:2px;">SHOPPING EN CHINE</div>
            <div style="color:#c8a97a;font-size:12px;letter-spacing:3px;margin-top:6px;text-transform:uppercase;">La Chine à portée de main</div>
        </td></tr>
        <tr><td style="padding:32px;">{inner}</td></tr>
        <tr><td style="background:#faf7f2;padding:24px 32px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0 0 6px;font-size:13px;color:#1d1d1d;font-weight:bold;">Shopping en Chine</p>
            <p style="margin:0;font-size:12px;color:#888;line-height:1.7;">
                Guangzhou, 510000 Guangdong, Chine<br/>
                <a href="mailto:serviceclients@shoppingenchine.com" style="color:#c64c3a;text-decoration:none;">serviceclients@shoppingenchine.com</a>
                &nbsp;·&nbsp; <a href="https://shoppingenchine.com" style="color:#c64c3a;text-decoration:none;">shoppingenchine.com</a>
            </p>
            <p style="margin:12px 0 0;font-size:11px;color:#bbb;">Merci de votre confiance ✦ Service client 7j/7</p>
        </td></tr>
    </table>
    </div>
    """


OFFICIAL_SENDER = "serviceclients@shoppingenchine.com"
FALLBACK_SENDER = "onboarding@resend.dev"  # sandbox : ne livre qu'au propriétaire du compte

# ---------------------------------------------------------------------------
# Journal des envois (collection email_log) — traçabilité de CHAQUE tentative.
# Consultable par le vendeur via GET /api/emails/log ; le statut de livraison
# (delivered / bounced) est mis à jour par le webhook Resend /api/emails/resend-webhook.
# ---------------------------------------------------------------------------
_log_client = None


def _log_db():
    global _log_client
    if _log_client is None:
        from motor.motor_asyncio import AsyncIOMotorClient
        _log_client = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    return _log_client


async def _log_send(tag: str, to, subject: str, sender: str,
                    resend_id: str | None = None, error: str | None = None) -> None:
    """Best-effort : ne doit JAMAIS faire échouer l'envoi lui-même."""
    try:
        await _log_db().email_log.insert_one({
            "tag": tag,
            "to": to if isinstance(to, list) else [to],
            "subject": subject,
            "from": sender,
            "resend_id": resend_id,
            "delivery_status": "sent" if resend_id else "send_failed",
            "error": error,
            "at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        logger.debug("[Email] journal email_log indisponible")


async def _send_raw(params: dict, tag: str) -> dict:
    """
    Envoie via Resend en essayant D'ABORD l'adresse officielle du domaine.
    Si le domaine n'est pas encore vérifié chez Resend, replie sur l'adresse
    sandbox (le marchand reçoit au moins la notification) et logge un
    avertissement explicite. Dès que le domaine est vérifié sur
    https://resend.com/domains, les clients reçoivent automatiquement.
    Chaque tentative (succès ou échec) est journalisée dans email_log.
    """
    to, subject = params.get("to"), params.get("subject", "")
    sender = OFFICIAL_SENDER
    try:
        email = await asyncio.to_thread(
            resend.Emails.send,
            {**params, "from": f"Shopping en Chine <{OFFICIAL_SENDER}>"},
        )
    except Exception as e:
        if "not verified" not in str(e).lower():
            await _log_send(tag, to, subject, sender, error=str(e))
            raise
        logger.warning(
            f"[Email:{tag}] Domaine shoppingenchine.com NON VÉRIFIÉ chez Resend — "
            f"repli sur {FALLBACK_SENDER} (livraison limitée au compte Resend). "
            "Vérifiez le domaine sur https://resend.com/domains pour atteindre les clients."
        )
        sender = FALLBACK_SENDER
        try:
            email = await asyncio.to_thread(
                resend.Emails.send,
                {**params, "from": f"Shopping en Chine <{FALLBACK_SENDER}>"},
            )
        except Exception as e2:
            await _log_send(tag, to, subject, sender, error=str(e2))
            raise
    await _log_send(tag, to, subject, sender, resend_id=email.get("id"))
    return email


async def _send(to: str, subject: str, html: str, tag: str) -> bool:
    try:
        email = await _send_raw({"to": [to], "subject": subject, "html": html}, tag)
        logger.info(f"[Email:{tag}] sent to {to} (id={email.get('id')})")
        return True
    except Exception:
        logger.exception(f"[Email:{tag}] failed for {to}")
        return False


async def _claim_customer_email(db: AsyncIOMotorDatabase, order_id: str) -> dict | None:
    """Décision d'envoi : réclame atomiquement le drapeau customer_email_sent
    (empêche les doublons webhook/polling). Retourne la commande si envoi dû."""
    return await db.orders.find_one_and_update(
        {"id": order_id, "customer_email_sent": {"$ne": True},
         "customer.email": {"$nin": [None, ""]}},
        {"$set": {"customer_email_sent": True}},
        projection={"_id": 0},
    )


def _customer_confirmation_html(order: dict) -> str:
    """Template HTML de l'email de confirmation client."""
    rows = _items_rows_html(order.get("items") or [], padding="6px 10px", border=False)
    track_link = f"{FRONTEND_URL}/suivi/{order.get('id')}" if FRONTEND_URL else ""
    c = order.get("customer") or {}
    delivery_lines = "<br/>".join(filter(None, [
        c.get("name"),
        c.get("phone"),
        ", ".join(filter(None, [c.get("address"), c.get("city")])),
    ]))
    return f"""
        <div style="text-align:center;">
            <div style="display:inline-block;background:#e8f5e9;color:#2e7d32;border-radius:99px;padding:8px 20px;font-size:13px;font-weight:bold;">✓ Paiement confirmé</div>
            <h1 style="margin:18px 0 8px;font-size:26px;color:#1d1d1d;">Merci pour votre commande !</h1>
            <p style="margin:0 0 4px;font-size:15px;color:#666;">Commande <strong style="color:#c64c3a;">{_order_no(order.get('id'))}</strong></p>
            <p style="margin:0 0 24px;font-size:13px;color:#999;">Nous préparons votre colis pour l'expédition depuis la Chine.</p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;border-radius:12px;overflow:hidden;">
            <tr>
                <td style="padding:12px 16px;font-size:11px;font-weight:bold;color:#999;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #eee;">Article</td>
                <td style="padding:12px 16px;font-size:11px;font-weight:bold;color:#999;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #eee;text-align:center;">Qté</td>
                <td style="padding:12px 16px;font-size:11px;font-weight:bold;color:#999;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #eee;text-align:right;">Prix</td>
            </tr>
            {rows}
            <tr>
                <td colspan="2" style="padding:14px 16px;font-size:16px;font-weight:bold;color:#1d1d1d;border-top:2px solid #1d1d1d;">Total payé</td>
                <td style="padding:14px 16px;font-size:18px;font-weight:bold;color:#c64c3a;text-align:right;border-top:2px solid #1d1d1d;">{_fmt_price(order.get('amount', 0))}</td>
            </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
            <tr>
                <td style="background:#faf7f2;border-radius:12px;padding:16px 20px;vertical-align:top;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:bold;color:#999;text-transform:uppercase;letter-spacing:1px;">📍 Adresse de livraison</p>
                    <p style="margin:0;font-size:14px;color:#333;line-height:1.7;">{delivery_lines or '—'}</p>
                </td>
            </tr>
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#777;text-align:center;">
            🚚 Livraison estimée sous <strong>15 à 20 jours ouvrés</strong>. Vous serez informé(e) à chaque étape du trajet.
        </p>
        {f'<p style="margin:22px 0 0;text-align:center;"><a href="{track_link}" style="display:inline-block;background:#c64c3a;color:#ffffff;padding:14px 34px;border-radius:99px;text-decoration:none;font-size:15px;font-weight:bold;">Suivre ma commande</a></p>' if track_link else ''}
    """


async def maybe_send_customer_confirmation(db: AsyncIOMotorDatabase, order_id: str) -> bool:
    """Confirmation to the CUSTOMER, once per order (décision puis envoi)."""
    if not RESEND_API_KEY:
        return False
    order = await _claim_customer_email(db, order_id)
    if not order:
        return False
    to = (order.get("customer") or {}).get("email")
    inner = _customer_confirmation_html(order)
    ok = await _send(to, f"{_test_tag(order)}Commande confirmée — {_order_no(order.get('id'))}", _wrap(inner), "customer-confirm")
    if not ok:
        await db.orders.update_one({"id": order_id}, {"$set": {"customer_email_sent": False}})
    return ok


async def send_recovery_email(db: AsyncIOMotorDatabase, order: dict) -> bool:
    """Cart-abandonment recovery: one-click retry link. Caller claims the flag."""
    if not RESEND_API_KEY:
        return False
    to = (order.get("customer") or {}).get("email")
    if not to:
        return False
    retry_link = f"{FRONTEND_URL}/reprise/{order.get('id')}" if FRONTEND_URL else ""
    items = order.get("items") or []
    names = ", ".join(it.get("name", "") for it in items[:3])
    inner = f"""
        <h1 style="margin:0 0 6px;font-size:20px;color:#1d1d1d;">Votre commande vous attend 🛒</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#555;">
            Bonjour {(order.get('customer') or {}).get('name', '')},<br/>
            votre paiement pour <strong>{names}</strong> ({_fmt_price(order.get('amount', 0))}) n'a pas abouti.
            Vos articles sont toujours réservés !
        </p>
        {f'<p style="margin:0;"><a href="{retry_link}" style="display:inline-block;background:#c64c3a;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-size:15px;font-weight:bold;">Reprendre ma commande en 1 clic</a></p>' if retry_link else ''}
        <p style="margin:18px 0 0;font-size:12px;color:#999;">Wave, Orange Money, MTN ou carte bancaire acceptés.</p>
    """
    return await _send(to, f"{_test_tag(order)}Votre panier vous attend — Shopping en Chine", _wrap(inner), "recovery")


async def send_tracking_update(order: dict, step_label: str) -> bool:
    """Notify the customer when the merchant advances the tracking step."""
    if not RESEND_API_KEY:
        return False
    to = (order.get("customer") or {}).get("email")
    if not to:
        return False
    track_link = f"{FRONTEND_URL}/suivi/{order.get('id')}" if FRONTEND_URL else ""
    inner = f"""
        <h1 style="margin:0 0 6px;font-size:20px;color:#1d1d1d;">Votre colis avance 📦</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#555;">
            Commande <strong>{_order_no(order.get('id'))}</strong> — nouveau statut :
            <strong style="color:#c64c3a;">{step_label}</strong>
        </p>
        {f'<p style="margin:0;"><a href="{track_link}" style="display:inline-block;background:#1d1d1d;color:#fff;padding:10px 20px;border-radius:99px;text-decoration:none;font-size:14px;">Voir le suivi complet</a></p>' if track_link else ''}
    """
    return await _send(to, f"{_test_tag(order)}Suivi de commande — {step_label}", _wrap(inner), "tracking")
