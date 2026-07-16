"""
Webhook -> email integration test (idempotence + live-status regression).

IMPORTANT: This test triggers exactly ONE real email to MERCHANT_EMAIL via
Resend. The second webhook POST must NOT send another email (idempotence).
"""
import os
import subprocess
import time
import pytest
import pymongo
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
# Fallback: read from frontend/.env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"
BACKEND_LOG = "/var/log/supervisor/backend.err.log"

ORDER_ID = "ord_ta_email1"
TX_ID = "tx_ta_email1"
PAXITY_TX_ID = "px_ta_email1"


@pytest.fixture(scope="module")
def db():
    c = pymongo.MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup(db):
    # Cleanup any prior run
    db.orders.delete_one({"id": ORDER_ID})
    db.paxity_transactions.delete_one({"id": TX_ID})
    db.orders.insert_one({
        "id": ORDER_ID,
        "customer": {"name": "Test QA", "email": "qa@x.com", "phone": "770000001",
                     "address": "Rue 1", "city": "Dakar"},
        "items": [{"name": "Mug", "qty": 1, "price": 12000}],
        "amount": 12000,
        "currency": "XOF",
        "status": "pending",
        "payment_method": "WAVESN",
        "transaction_id": TX_ID,
        "created_at": "2026-02-10T10:00:00+00:00",
        "tracking_step": "ordered",
        "tracking_history": [],
    })
    db.paxity_transactions.insert_one({
        "id": TX_ID,
        "order_id": ORDER_ID,
        "paxity_transaction_id": PAXITY_TX_ID,
        "status": "pending",
        "amount": 12000,
    })
    yield
    # Final cleanup
    db.orders.delete_one({"id": ORDER_ID})
    db.paxity_transactions.delete_one({"id": TX_ID})


def _log_count_for_order():
    """Count occurrences of the specific success log line for our order id."""
    try:
        out = subprocess.run(
            ["grep", "-cF", f"[Email] Order confirmation sent for {ORDER_ID}", BACKEND_LOG],
            capture_output=True, text=True,
        )
        return int((out.stdout or "0").strip() or 0)
    except Exception:
        return 0


def test_webhook_success_triggers_email(db):
    # Baseline log count (should be 0 for a fresh order id)
    before = _log_count_for_order()

    resp = requests.post(
        f"{BASE_URL}/api/paxity/webhook",
        json={"data": {"transactionId": PAXITY_TX_ID, "status": "SUCCESS", "idClient": ORDER_ID}},
        timeout=30,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"received": True}

    # Give the async email + Mongo update a beat
    time.sleep(3)

    order = db.orders.find_one({"id": ORDER_ID}, {"_id": 0})
    assert order is not None
    assert order["status"] == "success", f"order status={order.get('status')}"
    assert order.get("confirmation_email_sent") is True, order

    after = _log_count_for_order()
    assert after == before + 1, f"Expected exactly one new log line; before={before} after={after}"


def test_webhook_idempotence_no_second_email(db):
    before = _log_count_for_order()

    resp = requests.post(
        f"{BASE_URL}/api/paxity/webhook",
        json={"data": {"transactionId": PAXITY_TX_ID, "status": "SUCCESS", "idClient": ORDER_ID}},
        timeout=30,
    )
    assert resp.status_code == 200
    assert resp.json() == {"received": True}

    time.sleep(2)

    order = db.orders.find_one({"id": ORDER_ID}, {"_id": 0})
    assert order["confirmation_email_sent"] is True
    assert order["status"] == "success"

    after = _log_count_for_order()
    assert after == before, (
        f"Idempotence broken: log count grew {before}->{after} (email sent twice)"
    )


def test_live_status_endpoint_still_works():
    """A pending tx from the existing DB should return 200 without crashing."""
    resp = requests.get(f"{BASE_URL}/api/paxity/status/tx_46be2c7da52a46a6", timeout=20)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["transaction_id"] == "tx_46be2c7da52a46a6"
    # Status will typically remain 'pending' (Paxity likely returns pending/not found)
    assert body["status"] in {"pending", "success", "failed"}
