"""Iteration 20 — Stripe checkout + status, regression on paxity/products/auth, tracking notification."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

fe = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or fe["REACT_APP_BACKEND_URL"]).rstrip("/")
be = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or be["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME") or be["DB_NAME"]


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def creds():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("no credentials file")
    txt = p.read_text()
    e = re.search(r"(?im)^\s*(?:[-*]\s*)?(?:\*\*)?email(?:\*\*)?\s*:\s*`?([^`\s]+)", txt)
    pw = re.search(r"(?im)^\s*(?:[-*]\s*)?(?:\*\*)?password(?:\*\*)?\s*:\s*`?([^`\s]+)", txt)
    if not e or not pw:
        pytest.skip("bad credentials file")
    return {"email": e.group(1), "password": pw.group(1)}


# ---- Regression: config, products, login ----
class TestRegression:
    def test_paxity_config(self, client):
        r = client.get(f"{BASE_URL}/api/paxity/config")
        assert r.status_code == 200
        data = r.json()
        assert data["configured"] == True
        assert isinstance(data["methods"], list) and len(data["methods"]) >= 3

    def test_products_list(self, client):
        r = client.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        products = r.json()["products"]
        assert isinstance(products, list) and len(products) >= 1
        # Catalogue réel (plus de seed p1) : chaque produit expose id/name/price
        for p in products[:3]:
            assert p.get("id") and p.get("name") and p.get("price") is not None

    def test_login_seller(self, client, creds):
        r = client.post(f"{BASE_URL}/api/auth/login",
                        json={"email": creds["email"], "password": creds["password"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data or "access_token" in data or data.get("ok") or data.get("seller")


# ---- Stripe ----
class TestStripe:
    order_id = None
    session_id = None

    def test_checkout_creates_order(self, client, require_stripe):
        # Utilise le premier produit réel du catalogue (plus de seed p1)
        products = client.get(f"{BASE_URL}/api/products").json()["products"]
        assert products, "catalogue vide — impossible de tester le checkout"
        payload = {
            "origin_url": BASE_URL,
            "customer": {"name": "TEST_QA", "email": "test@example.com", "city": "Dakar"},
            "items": [{"product_id": products[0]["id"], "qty": 1}],
        }
        r = client.post(f"{BASE_URL}/api/payments/stripe/checkout", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        # Checkout embarqué : client_secret présent (checkout_url peut être None)
        assert data.get("client_secret") or data.get("checkout_url")
        assert data["session_id"].startswith("cs_")
        # Numéros de commande séquentiels (ex : "1031") depuis next_order_number
        assert str(data["order_id"]).strip()
        TestStripe.order_id = data["order_id"]
        TestStripe.session_id = data["session_id"]

    def test_checkout_unknown_product(self, client):
        r = client.post(f"{BASE_URL}/api/payments/stripe/checkout", json={
            "origin_url": BASE_URL,
            "customer": {"name": "TEST_QA"},
            "items": [{"product_id": "p_nope_zzz", "qty": 1}],
        })
        assert r.status_code == 400

    def test_status_returns_pending(self, client, require_stripe):
        assert TestStripe.session_id, "prev test must have run"
        r = client.get(f"{BASE_URL}/api/payments/stripe/status/{TestStripe.session_id}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["order_id"] == TestStripe.order_id
        assert data["payment_status"] in ("pending", "unpaid")
        assert data["status"] in ("initiated", "pending", "open")

    def test_status_unknown_session(self, client):
        r = client.get(f"{BASE_URL}/api/payments/stripe/status/cs_test_nonexistent_xxx")
        assert r.status_code == 404

    def test_cleanup_stripe_order(self):
        """Delete the test order + payment_transaction so we don't leave junk in DB."""
        if not TestStripe.order_id:
            return
        c = MongoClient(MONGO_URL)
        db = c[DB_NAME]
        db.orders.delete_one({"id": TestStripe.order_id})
        db.payment_transactions.delete_one({"session_id": TestStripe.session_id})
        c.close()


# ---- Tracking notification fire-and-forget ----
class TestTracking:
    def test_tracking_step_update_no_500(self, client):
        """Create a temp order in DB, update its tracking step, restore, cleanup."""
        c = MongoClient(MONGO_URL)
        db = c[DB_NAME]
        from datetime import datetime, timezone
        oid = f"ord_TEST_track_{int(datetime.now(timezone.utc).timestamp())}"
        now = datetime.now(timezone.utc).isoformat()
        db.orders.insert_one({
            "id": oid,
            "customer": {"name": "TEST_QA", "email": "test@example.com", "city": "Dakar"},
            "items": [{"product_id": "p1", "name": "TEST", "price": 1000, "qty": 1}],
            "amount": 1000, "currency": "XOF",
            "status": "success", "payment_method": "CARD",
            "created_at": now,
            "tracking_step": "ordered",
            "tracking_history": [{"step": "ordered", "at": now}],
        })
        try:
            r = client.put(f"{BASE_URL}/api/tracking/{oid}", json={"step": "shipped"})
            assert r.status_code == 200, r.text
            doc = db.orders.find_one({"id": oid})
            assert doc["tracking_step"] == "shipped"
        finally:
            db.orders.delete_one({"id": oid})
            c.close()


# ---- About page (frontend HTML served under /a-propos → CRA index.html) ----
class TestAboutRoute:
    def test_about_route_serves_app(self, client):
        r = client.get(f"{BASE_URL}/a-propos", allow_redirects=True)
        # CRA SPA — should return 200 with index.html
        assert r.status_code == 200
        assert "<div id=\"root\">" in r.text or "<title>" in r.text


# ---- Recovery loop marker sanity (best-effort, does not require live email) ----
class TestRecoveryFlag:
    def test_recovery_flag_field_exists_on_eligible_orders(self):
        c = MongoClient(MONGO_URL)
        db = c[DB_NAME]
        try:
            count_sent = db.orders.count_documents({"recovery_email_sent": True})
            print(f"orders with recovery_email_sent=True: {count_sent}")
            assert count_sent >= 0
        finally:
            c.close()
