"""Iter 27 — Multi-currency (priceEur / priceUsd) on products + Stripe checkout.

Verifies:
- Seller login + product create with priceEur/priceUsd (persisted via GET)
- Stripe checkout for EUR (qty=1) charges 25.0 and USD (qty=2) charges 60.0
  when explicit prices are set (session is created only, no payment).
- Fallback: product without priceEur/priceUsd at 9000 F → USD checkout gives 32.0.
- Cleanup: delete test products.
"""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")

SELLER_EMAIL = "Modou.ba.568@gmail.com"
SELLER_PWD = "40881215.Com"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": SELLER_EMAIL, "password": SELLER_PWD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


created_ids = []


def _create(headers, payload):
    r = requests.post(f"{BASE_URL}/api/products", headers=headers, json=payload, timeout=30)
    assert r.status_code == 201, f"Create failed: {r.status_code} {r.text[:300]}"
    pid = r.json()["id"]
    created_ids.append(pid)
    return r.json()


def test_create_product_with_multicurrency_persists(hdr):
    payload = {
        "name": "TEST_MC iter27",
        "category": "mode",
        "price": 9000,
        "priceEur": 25,
        "priceUsd": 30,
        "image": "",
        "description": "t",
    }
    created = _create(hdr, payload)
    assert created["priceEur"] == 25
    assert created["priceUsd"] == 30

    g = requests.get(f"{BASE_URL}/api/products/{created['id']}", timeout=30)
    assert g.status_code == 200
    data = g.json()
    assert data["priceEur"] == 25
    assert data["priceUsd"] == 30
    assert data["price"] == 9000


def test_stripe_checkout_eur_uses_explicit_price(hdr):
    pid = created_ids[0]
    r = requests.post(
        f"{BASE_URL}/api/payments/stripe/checkout",
        json={
            "origin_url": "https://example.com",
            "customer": {"name": "QA EUR", "email": "qa@example.test"},
            "items": [{"product_id": pid, "qty": 1}],
            "currency": "EUR",
        }, timeout=45,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    sid = r.json()["session_id"]
    # Verify in DB via order lookup - we can only see via status endpoint
    # Instead: check the transaction stored charged_amount by fetching orders?
    # Use order_id from response; there's no order-detail public endpoint here.
    # We rely on Stripe session inspection by hitting status which returns order_id
    # and payment_status still pending. To verify charged_amount, query DB.
    from pymongo import MongoClient
    from dotenv import dotenv_values as _dv
    be = _dv("/app/backend/.env")
    cli = MongoClient(be["MONGO_URL"])
    db = cli[be["DB_NAME"]]
    order = db.orders.find_one({"stripe_session_id": sid})
    assert order is not None, "Order not persisted"
    assert order["charged_currency"] == "EUR"
    assert order["charged_amount"] == 25.0, f"Expected 25.0 EUR, got {order['charged_amount']}"


def test_stripe_checkout_usd_qty2_uses_explicit_price(hdr):
    pid = created_ids[0]
    r = requests.post(
        f"{BASE_URL}/api/payments/stripe/checkout",
        json={
            "origin_url": "https://example.com",
            "customer": {"name": "QA USD", "email": "qa@example.test"},
            "items": [{"product_id": pid, "qty": 2}],
            "currency": "USD",
        }, timeout=45,
    )
    assert r.status_code == 200
    sid = r.json()["session_id"]
    from pymongo import MongoClient
    from dotenv import dotenv_values as _dv
    be = _dv("/app/backend/.env")
    cli = MongoClient(be["MONGO_URL"])
    db = cli[be["DB_NAME"]]
    order = db.orders.find_one({"stripe_session_id": sid})
    assert order is not None
    assert order["charged_currency"] == "USD"
    assert order["charged_amount"] == 60.0, f"Expected 60.0 USD, got {order['charged_amount']}"


def test_fallback_usd_when_no_explicit_price(hdr):
    payload = {
        "name": "TEST_MC_fallback iter27",
        "category": "mode",
        "price": 9000,
        "image": "",
        "description": "t",
    }
    created = _create(hdr, payload)
    assert created.get("priceEur") in (None, 0)
    assert created.get("priceUsd") in (None, 0)

    r = requests.post(
        f"{BASE_URL}/api/payments/stripe/checkout",
        json={
            "origin_url": "https://example.com",
            "customer": {"name": "QA fallback", "email": "qa@example.test"},
            "items": [{"product_id": created["id"], "qty": 1}],
            "currency": "USD",
        }, timeout=45,
    )
    assert r.status_code == 200
    sid = r.json()["session_id"]
    from pymongo import MongoClient
    from dotenv import dotenv_values as _dv
    be = _dv("/app/backend/.env")
    cli = MongoClient(be["MONGO_URL"])
    db = cli[be["DB_NAME"]]
    order = db.orders.find_one({"stripe_session_id": sid})
    assert order is not None
    assert order["charged_currency"] == "USD"
    assert order["charged_amount"] == 32.0, f"Expected 32.0 USD fallback, got {order['charged_amount']}"


def test_cleanup(hdr):
    for pid in created_ids:
        r = requests.delete(f"{BASE_URL}/api/products/{pid}", headers=hdr, timeout=30)
        assert r.status_code in (200, 204), f"delete {pid} → {r.status_code}"
    # Verify absence
    for pid in created_ids:
        g = requests.get(f"{BASE_URL}/api/products/{pid}", timeout=30)
        assert g.status_code == 404
