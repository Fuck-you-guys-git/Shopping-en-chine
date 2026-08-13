"""QA iteration 29 — email confirmation fallback (Resend domain not verified)."""
import asyncio
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

# Load backend env for MONGO/RESEND
BACKEND_DIR = Path("/app/backend")
sys.path.insert(0, str(BACKEND_DIR))
backend_env = dotenv_values(BACKEND_DIR / ".env")
for k, v in backend_env.items():
    os.environ.setdefault(k, v)

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (frontend_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = backend_env.get("MONGO_URL")
DB_NAME = backend_env.get("DB_NAME")

ORDER_ID = "qa_email_1"
TX_ID = "tx_qa_email_1"
PAXID = "qa_paxid_email_1"

BACKEND_LOG = "/var/log/supervisor/backend.err.log"


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


async def _seed(db):
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.delete_many({"id": ORDER_ID})
    await db.paxity_transactions.delete_many({"id": TX_ID})
    await db.orders.insert_one({
        "id": ORDER_ID,
        "customer": {
            "name": "QA Email",
            "email": "commands@shoppingenchine.com",
            "city": "Dakar",
            "phone": "+221700000000",
            "address": "Test",
        },
        "items": [{"product_id": "x", "name": "Article Email QA", "price": 9000, "qty": 1}],
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
        "paxity_transaction_id": PAXID,
        "created_at": now,
        "updated_at": now,
    })


async def _cleanup(db):
    await db.orders.delete_many({"id": ORDER_ID})
    await db.paxity_transactions.delete_many({"id": TX_ID})


def _read_log_tail(path=BACKEND_LOG, lines=400):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 200_000))
            data = f.read().decode(errors="ignore")
        return "\n".join(data.splitlines()[-lines:])
    except Exception as e:
        return f"(log read failed: {e})"


def test_setup_seed(db):
    asyncio.get_event_loop().run_until_complete(_seed(db))
    # verify persisted
    doc = asyncio.get_event_loop().run_until_complete(db.orders.find_one({"id": ORDER_ID}, {"_id": 0}))
    assert doc is not None
    assert doc["customer"]["email"] == "commands@shoppingenchine.com"


def test_webhook_success_triggers_emails(db):
    # Mark log start point via marker line count
    before = _read_log_tail(lines=1_000_000).count("\n")
    r = requests.post(
        f"{BASE_URL}/api/paxity/webhook",
        json={"data": {"transactionId": PAXID, "status": "SUCCESS"}},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("received") is True

    # Wait for async email sends
    time.sleep(8)

    doc = asyncio.get_event_loop().run_until_complete(db.orders.find_one({"id": ORDER_ID}, {"_id": 0}))
    assert doc["status"] == "success", f"order status={doc.get('status')}"
    assert doc.get("confirmation_email_sent") is True, "merchant email flag missing"
    assert doc.get("customer_email_sent") is True, "customer email flag missing"

    log = _read_log_tail(lines=800)
    # Merchant + customer send lines
    assert "Order confirmation sent" in log or "[Email]" in log, "no merchant email log"
    assert "customer-confirm" in log, f"customer email tag missing in log tail:\n{log[-4000:]}"
    # Warning about unverified domain (expected fallback)
    if "NON VÉRIFIÉ" in log:
        print("[OK] Fallback warning present (domain not verified) — expected")
    else:
        print("[INFO] No fallback warning — domain may be verified, or sent from official sender")


def test_webhook_idempotent(db):
    log_before = _read_log_tail(lines=800)
    # Count occurrences of send lines mentioning our order/customer email
    def count(substr, text):
        return text.count(substr)

    baseline_customer = count("customer-confirm] sent", log_before)
    baseline_merchant = count(f"Order confirmation sent for {ORDER_ID}", log_before)

    r = requests.post(
        f"{BASE_URL}/api/paxity/webhook",
        json={"data": {"transactionId": PAXID, "status": "SUCCESS"}},
        timeout=20,
    )
    assert r.status_code == 200
    time.sleep(5)

    log_after = _read_log_tail(lines=800)
    after_customer = count("customer-confirm] sent", log_after)
    after_merchant = count(f"Order confirmation sent for {ORDER_ID}", log_after)

    assert after_customer == baseline_customer, (
        f"Customer email sent again on 2nd webhook (before={baseline_customer} after={after_customer})"
    )
    assert after_merchant == baseline_merchant, (
        f"Merchant email sent again on 2nd webhook (before={baseline_merchant} after={after_merchant})"
    )


def test_send_raw_fallback_direct():
    """Unit: _send_raw should return dict with id, using fallback if domain unverified."""
    import email_service

    async def _go():
        return await email_service._send_raw(
            {
                "to": ["commands@shoppingenchine.com"],
                "subject": "QA test fallback",
                "html": "<p>test</p>",
            },
            "qa",
        )

    result = asyncio.get_event_loop().run_until_complete(_go())
    assert isinstance(result, dict), f"got {type(result)}: {result}"
    assert result.get("id"), f"no id in Resend response: {result}"
    print(f"[OK] _send_raw returned id={result.get('id')}")


def test_cleanup(db):
    asyncio.get_event_loop().run_until_complete(_cleanup(db))
    doc = asyncio.get_event_loop().run_until_complete(db.orders.find_one({"id": ORDER_ID}))
    assert doc is None
