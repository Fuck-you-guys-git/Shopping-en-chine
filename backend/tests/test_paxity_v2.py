"""Paxity v2-only + legacy removal regression tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env (test env may not inject REACT_APP_*)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ----- /api/paxity/config -------------------------------------------------
def test_paxity_config(client):
    r = client.get(f"{API}/paxity/config", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("configured") is True
    assert data.get("environment") == "live"
    assert data.get("currency") == "XOF"
    methods = data.get("methods") or []
    codes = sorted(m["code"] for m in methods)
    assert codes == ["OMCI", "OMSN", "WAVECI", "WAVESN"]


# ----- Legacy endpoints MUST be gone --------------------------------------
@pytest.mark.parametrize("path,method,body", [
    ("/paxity/v2/config", "GET", None),
    ("/payments/stripe/checkout", "POST", {"amount": 1000}),
    ("/paxity/card/init", "POST", {"amount": 1000}),
])
def test_legacy_endpoints_removed(client, path, method, body):
    url = f"{API}{path}"
    r = client.request(method, url, json=body, timeout=15)
    assert r.status_code == 404, f"Expected 404 for {path}, got {r.status_code}"


# ----- payin validation (no live hit) -------------------------------------
BASE_CUSTOMER = {"name": "Test User", "email": "t@example.com", "city": "Dakar"}


def _payload(**overrides):
    body = {
        "amount": 1500,
        "phone_number": "771234567",
        "prefix_phone": "221",
        "payment_method": "WAVESN",
        "description": "test",
        "delivery_mode": "standard",
        "customer": BASE_CUSTOMER,
        "items": [],
    }
    body.update(overrides)
    return body


def test_payin_invalid_card_method(client):
    r = client.post(f"{API}/paxity/payin", json=_payload(payment_method="CARD"), timeout=15)
    assert r.status_code == 400, r.text


def test_payin_zero_amount(client):
    r = client.post(f"{API}/paxity/payin", json=_payload(amount=0), timeout=15)
    assert r.status_code == 400, r.text


def test_payin_short_phone(client):
    r = client.post(f"{API}/paxity/payin", json=_payload(phone_number="12"), timeout=15)
    assert r.status_code == 400, r.text


# ----- status / webhook / orders ------------------------------------------
def test_status_unknown(client):
    r = client.get(f"{API}/paxity/status/unknown", timeout=15)
    assert r.status_code == 404


def test_webhook_fake_payload(client):
    r = client.post(f"{API}/paxity/webhook", json={"id": "txn_fake", "state": "succeeded"}, timeout=15)
    assert r.status_code == 200
    assert r.json() == {"received": True}


def test_get_order_tmp(client):
    # Seeded tmp order from previous testing session
    r = client.get(f"{API}/paxity/orders/tmp_f2621d3fc3", timeout=15)
    if r.status_code == 404:
        pytest.skip("tmp order not seeded in this environment")
    assert r.status_code == 200, r.text
    o = r.json()
    assert o.get("provider") == "paxity-v2"
    assert o.get("currency") == "XOF"
    assert o.get("status") == "pending"


# ----- Reconcile requires auth --------------------------------------------
def test_reconcile_requires_auth(client):
    r = client.post(f"{API}/paxity/reconcile", timeout=15)
    assert r.status_code in (401, 403), r.text


def test_reconcile_with_seller_auth(client):
    import os as _os
    email = _os.environ.get("TEST_SELLER_EMAIL")
    password = _os.environ.get("TEST_SELLER_PASSWORD")
    if not (email and password):
        # Try reading from backend/.env
        try:
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("TEST_SELLER_EMAIL="):
                        email = line.split("=", 1)[1].strip()
                    elif line.startswith("TEST_SELLER_PASSWORD="):
                        password = line.split("=", 1)[1].strip()
        except Exception:
            pass
    if not (email and password):
        pytest.skip("TEST_SELLER_EMAIL/PASSWORD not configured")
    s = requests.Session()
    lr = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert lr.status_code == 200, lr.text
    token = lr.json().get("access_token") or lr.json().get("token")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    r = s.post(f"{API}/paxity/reconcile", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("checked", "confirmed", "failed"):
        assert k in data
