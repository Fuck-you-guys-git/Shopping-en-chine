"""
Vérification que la notification marchande part UNIQUEMENT vers
commands@shoppingenchine.com (constante hardcodée dans email_service.py).

Scénario :
  1) Seed d'une commande + transaction Paxity pending (fixture seeded_order)
  2) POST /api/paxity/webhook avec status SUCCESS
  3) Vérifie que le webhook a bien mis la commande en success
  4) Cleanup (teardown de la fixture)
"""
import asyncio
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Generator

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
def db_factory() -> Callable:
    """Return a factory that creates a fresh motor client bound to the current loop."""
    from motor.motor_asyncio import AsyncIOMotorClient

    def _make():
        return AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    return _make


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_audit_merchant_email_constant() -> None:
    """La destination marchande doit être fixée dans le code, pas via os.environ."""
    src = Path("/app/backend/email_service.py").read_text()
    assert '"commands@shoppingenchine.com"' in src, \
        "commands@shoppingenchine.com absent des destinataires marchands"
    # Vérifie qu'aucune ligne ne fait MERCHANT_EMAIL/MERCHANT_RECIPIENTS = os.environ...
    for line in src.splitlines():
        stripped = line.strip()
        if stripped.startswith("MERCHANT_EMAIL") and "=" in stripped:
            assert "os.environ" not in stripped, \
                f"MERCHANT_EMAIL lu depuis env : {stripped!r}"


def test_no_stale_merchant_recipient_in_backend() -> None:
    """Aucune ancienne adresse marchande (bafatoumata*) ne doit rester."""
    result = subprocess.run(
        ["grep", "-rIn", "bafatoumata", "/app/backend",
         "--include=*.py", "--exclude-dir=tests"],
        capture_output=True, text=True,
    )
    assert result.stdout.strip() == "", \
        f"Occurrence(s) de bafatoumata trouvées :\n{result.stdout}"


async def _seed(db) -> None:
    """Nettoie puis insère la commande + transaction pending de test."""
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


@pytest.fixture()
def seeded_order(db_factory: Callable) -> Generator[str, None, None]:
    """Seed commande + transaction pending ; nettoie après le test."""
    asyncio.run(_seed(db_factory()))
    yield ORDER_ID

    async def _cleanup():
        db = db_factory()
        await db.orders.delete_many({"id": ORDER_ID})
        await db.paxity_transactions.delete_many({"id": TX_ID})
    asyncio.run(_cleanup())


def test_webhook_success_marks_order_and_sends_merchant_email(
        seeded_order: str, db_factory: Callable) -> None:
    resp = requests.post(
        f"{BASE_URL}/api/paxity/webhook",
        json={"data": {"transactionId": PAXITY_TX_ID, "status": "SUCCESS"}},
        timeout=30,
    )
    assert resp.status_code == 200, f"webhook status={resp.status_code} body={resp.text}"
    assert resp.json() == {"received": True}

    async def _verify():
        await asyncio.sleep(6)
        db = db_factory()
        order = await db.orders.find_one({"id": seeded_order}, {"_id": 0})
        assert order is not None
        assert order["status"] == "success", f"order status={order['status']}"
        assert order.get("confirmation_email_sent") == True, "flag confirmation_email_sent absent/false"
    asyncio.run(_verify())
