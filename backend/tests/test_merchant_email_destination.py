"""
Vérification que la notification marchande part UNIQUEMENT vers
commands@shoppingenchine.com (constante hardcodée dans email_service.py).

Scénario :
  1) Seed d'une commande + transaction Paxity pending
  2) POST /api/paxity/webhook avec status SUCCESS
  3) Vérifie que le webhook a bien mis la commande en success
  4) Cleanup

Les vérifications côté logs (destinataire commands@..., pas de bafatoumata,
pas de fallback NON VÉRIFIÉ) sont faites via un test bash séparé.
"""
import os
import sys
import time
import asyncio
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

# Load backend env for Mongo
backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = backend_env.get("MONGO_URL")
DB_NAME = backend_env.get("DB_NAME")

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or frontend_env.get("REACT_APP_BACKEND_URL")
).rstrip("/")

ORDER_ID = "qa_dest_1"
TX_ID = "tx_qa_dest_1"
PAXITY_TX_ID = "qa_paxid_dest_1"


@pytest.fixture(scope="module")
def db_factory():
    """Return a factory that creates a fresh motor client bound to the current loop."""
    from motor.motor_asyncio import AsyncIOMotorClient

    def _make():
        return AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    return _make


def _now():
    return datetime.now(timezone.utc).isoformat()


def test_audit_merchant_email_constant():
    """MERCHANT_EMAIL doit être une constante hardcodée, pas os.environ."""
    src = Path("/app/backend/email_service.py").read_text()
    assert 'MERCHANT_EMAIL = "commands@shoppingenchine.com"' in src, \
        "MERCHANT_EMAIL n'est pas une constante hardcodée"
    # Vérifie qu'aucune ligne ne fait MERCHANT_EMAIL = os.environ...
    for line in src.splitlines():
        stripped = line.strip()
        if stripped.startswith("MERCHANT_EMAIL") and "=" in stripped:
            assert "os.environ" not in stripped, \
                f"MERCHANT_EMAIL lu depuis env : {stripped!r}"


def test_no_stale_merchant_recipient_in_backend():
    """Aucune ancienne adresse marchande (bafatoumata*) ne doit rester."""
    import subprocess
    result = subprocess.run(
        ["grep", "-rIn", "bafatoumata", "/app/backend",
         "--include=*.py", "--exclude-dir=tests"],
        capture_output=True, text=True,
    )
    assert result.stdout.strip() == "", \
        f"Occurrence(s) de bafatoumata trouvées :\n{result.stdout}"


@pytest.mark.asyncio
async def _seed_and_webhook(db):
    # --- Cleanup préalable au cas où
    await db.orders.delete_many({"id": ORDER_ID})
    await db.paxity_transactions.delete_many({"id": TX_ID})

    # --- Seed
    now = _now()
    await db.orders.insert_one({
        "id": ORDER_ID,
        "customer": {
            "name": "QA Dest",
            "email": "commands@shoppingenchine.com",
            "city": "Dakar",
            "phone": "+221700000000",
            "address": "Test",
        },
        "items": [{"product_id": "x", "name": "Article Dest QA", "price": 9000, "qty": 1}],
        "amount": 9000,
        "currency": "XOF",
        "status": "pending",
        "payment_method": "WAVESN",
        "delivery_mode": "standard",
        "created_at": now,
    })
    await db.paxity_transactions.insert_one({
        "id": TX_ID,
        "order_id": ORDER_ID,
        "amount": 9000,
        "currency": "XOF",
        "payment_method": "WAVESN",
        "status": "pending",
        "paxity_transaction_id": PAXITY_TX_ID,
        "created_at": now,
        "updated_at": now,
    })


def test_seed_webhook_and_verify(db_factory):
    async def _flow():
        db = db_factory()
        # cleanup + seed
        await db.orders.delete_many({"id": ORDER_ID})
        await db.paxity_transactions.delete_many({"id": TX_ID})
        now = _now()
        await db.orders.insert_one({
            "id": ORDER_ID,
            "customer": {
                "name": "QA Dest",
                "email": "commands@shoppingenchine.com",
                "city": "Dakar",
                "phone": "+221700000000",
                "address": "Test",
            },
            "items": [{"product_id": "x", "name": "Article Dest QA", "price": 9000, "qty": 1}],
            "amount": 9000,
            "currency": "XOF",
            "status": "pending",
            "payment_method": "WAVESN",
            "delivery_mode": "standard",
            "created_at": now,
        })
        await db.paxity_transactions.insert_one({
            "id": TX_ID,
            "order_id": ORDER_ID,
            "amount": 9000,
            "currency": "XOF",
            "payment_method": "WAVESN",
            "status": "pending",
            "paxity_transaction_id": PAXITY_TX_ID,
            "created_at": now,
            "updated_at": now,
        })

        # POST webhook (sync inside async is fine — requests will block)
        resp = requests.post(
            f"{BASE_URL}/api/paxity/webhook",
            json={"data": {"transactionId": PAXITY_TX_ID, "status": "SUCCESS"}},
            timeout=30,
        )
        assert resp.status_code == 200, f"webhook status={resp.status_code} body={resp.text}"
        assert resp.json() == {"received": True}

        await asyncio.sleep(6)

        order = await db.orders.find_one({"id": ORDER_ID}, {"_id": 0})
        assert order is not None
        assert order["status"] == "success", f"order status={order['status']}"
        assert order.get("confirmation_email_sent") is True, "flag confirmation_email_sent absent/false"

    asyncio.run(_flow())


def test_cleanup(db_factory):
    async def _c():
        db = db_factory()
        await db.orders.delete_many({"id": ORDER_ID})
        await db.paxity_transactions.delete_many({"id": TX_ID})
    asyncio.run(_c())
