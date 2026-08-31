"""
Export CSV des commandes payées via PAXITY (les paiements Stripe sont exclus).

GET /api/orders/export.csv  -> fichier CSV (auth vendeur)

Colonnes : n° de commande, date, client, contact, ville/pays, famille et code
du moyen de paiement, devise + montant payé, équivalent F CFA, statut, étape
de suivi, mode de livraison, articles. Trois lignes de totaux en fin de
fichier : Carte bancaire, Mobile Money, et total général.

Le fichier est encodé en UTF-8 avec BOM et séparé par « ; » pour s'ouvrir
directement dans Excel en français.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

# Codes de moyens de paiement réellement utilisés par Paxity
CARD_CODES = {"CARD"}
MOBILE_CODES = {
    "WAVESN": "Wave Sénégal",
    "WAVECI": "Wave Côte d'Ivoire",
    "OMSN": "Orange Money Sénégal",
    "OMCI": "Orange Money Côte d'Ivoire",
    "MTNCI": "MTN Mobile Money",
}
CODE_LABELS = {"CARD": "Carte bancaire", **MOBILE_CODES}

# Statuts considérés comme payés (identique au tableau de bord vendeur)
PAID_STATUSES = {
    "success", "successful", "paid", "completed", "confirmed", "ok", "done",
    "shipped", "customs", "delivery", "delivered",
}

STEP_LABELS_FR = {
    "ordered": "Commandé",
    "shipped": "Expédié de Chine",
    "customs": "En douane",
    "delivery": "En livraison",
    "delivered": "Livré",
}

HEADER = [
    "N° commande", "Date", "Client", "Email", "Téléphone", "Ville", "Adresse",
    "Type de paiement", "Moyen de paiement", "Devise", "Montant payé",
    "Équivalent F CFA", "Statut", "Étape de suivi", "Livraison", "Articles",
]


def is_paxity_order(o: dict) -> bool:
    """Exclut les commandes Stripe : elles portent un `stripe_session_id`
    (ou explicitement provider=stripe pour les commandes récentes)."""
    if o.get("stripe_session_id"):
        return False
    if str(o.get("provider") or "").lower() == "stripe":
        return False
    return True


def is_paid(o: dict) -> bool:
    return str(o.get("status") or "").lower() in PAID_STATUSES


def payment_family(method: str | None) -> str:
    code = str(method or "").upper()
    if code in CARD_CODES:
        return "Carte bancaire"
    if code in MOBILE_CODES:
        return "Mobile Money"
    return "Non renseigné"


def _fmt_date(raw) -> str:
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(raw or "")


def _items_label(items: list) -> str:
    parts = []
    for it in items or []:
        label = f"{it.get('name', 'Article')} x{it.get('qty', 1)}"
        extras = [v for v in (it.get("color"), it.get("size")) if v]
        if extras:
            label += f" ({', '.join(extras)})"
        parts.append(label)
    return " | ".join(parts)


def _xof_amount(o: dict) -> float:
    v = o.get("amount_xof")
    if v is None:
        v = o.get("amount")
    try:
        return float(v or 0)
    except Exception:
        return 0.0


def build_orders_csv(orders: list[dict]) -> tuple[str, dict]:
    """Renvoie (contenu CSV, totaux) pour les commandes PAYÉES via Paxity."""
    rows = [o for o in orders if is_paxity_order(o) and is_paid(o)]
    rows.sort(key=lambda o: str(o.get("created_at") or ""))

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    w.writerow(HEADER)

    totals = {"Carte bancaire": 0.0, "Mobile Money": 0.0, "Non renseigné": 0.0}
    counts = {"Carte bancaire": 0, "Mobile Money": 0, "Non renseigné": 0}

    for o in rows:
        c = o.get("customer") or {}
        family = payment_family(o.get("payment_method"))
        xof = _xof_amount(o)
        totals[family] += xof
        counts[family] += 1
        w.writerow([
            o.get("id", ""),
            _fmt_date(o.get("created_at")),
            c.get("name", ""),
            c.get("email", ""),
            c.get("phone", ""),
            c.get("city", ""),
            c.get("address", ""),
            family,
            CODE_LABELS.get(str(o.get("payment_method") or "").upper(), o.get("payment_method") or ""),
            o.get("currency", "XOF"),
            o.get("amount", ""),
            round(xof),
            "Payée",
            STEP_LABELS_FR.get(o.get("tracking_step") or o.get("status"), "Commandé"),
            "Express" if o.get("delivery_mode") == "express" else "Standard",
            _items_label(o.get("items")),
        ])

    grand = sum(totals.values())
    w.writerow([])
    w.writerow(["TOTAUX (paiements Paxity uniquement — Stripe exclu)"])
    w.writerow(["Type de paiement", "Nombre de commandes", "Total F CFA"])
    for family in ("Carte bancaire", "Mobile Money", "Non renseigné"):
        if counts[family]:
            w.writerow([family, counts[family], round(totals[family])])
    w.writerow(["TOTAL GÉNÉRAL", sum(counts.values()), round(grand)])

    summary = {
        "orders": sum(counts.values()),
        "card_total": round(totals["Carte bancaire"]),
        "mobile_total": round(totals["Mobile Money"]),
        "grand_total": round(grand),
    }
    # BOM UTF-8 : Excel FR ouvre le fichier avec les bons accents
    return "\ufeff" + buf.getvalue(), summary


def export_filename() -> str:
    return f"commandes-paxity-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
