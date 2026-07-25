"""Iteration 19: seller /api/orders and /api/orders/bulk-tracking tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paxity-payment-web.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SELLER_EMAIL = "Modou.ba.568@gmail.com"
SELLER_PASSWORD = "40881215.Com"
DEMO_ORDER_ID = "ord_demo12345678"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_orders_requires_auth():
    r = requests.get(f"{API}/orders", timeout=15)
    assert r.status_code == 401


def test_orders_list(auth_headers):
    r = requests.get(f"{API}/orders", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "orders" in data
    assert isinstance(data["orders"], list)
    assert len(data["orders"]) >= 1
    # Ensure no _id field leaks (MongoDB ObjectId)
    for o in data["orders"]:
        assert "_id" not in o
        assert "id" in o
    print(f"orders count = {len(data['orders'])}")


def test_bulk_tracking_requires_auth():
    r = requests.put(f"{API}/orders/bulk-tracking", json={"order_ids": ["x"], "step": "shipped"}, timeout=15)
    assert r.status_code == 401


def test_bulk_tracking_invalid_step(auth_headers):
    r = requests.put(f"{API}/orders/bulk-tracking", headers=auth_headers,
                     json={"order_ids": ["ord_x"], "step": "bogus"}, timeout=15)
    assert r.status_code == 400


def test_bulk_tracking_updates_and_restores(auth_headers):
    # get 2 real orders that are NOT the demo one
    r = requests.get(f"{API}/orders", headers=auth_headers, timeout=15)
    orders = r.json()["orders"]
    candidates = [o for o in orders if o["id"] != DEMO_ORDER_ID][:2]
    assert len(candidates) == 2, "need at least 2 real orders for bulk test"
    ids = [o["id"] for o in candidates]
    original_steps = {o["id"]: (o.get("tracking_step") or "ordered") for o in candidates}

    # bulk update to shipped
    r = requests.put(f"{API}/orders/bulk-tracking", headers=auth_headers,
                     json={"order_ids": ids, "step": "shipped"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["updated"] == 2
    assert body["step"] == "shipped"

    # verify via GET /api/tracking/{id}
    for oid in ids:
        t = requests.get(f"{API}/tracking/{oid}", timeout=15)
        assert t.status_code == 200
        assert t.json()["tracking_step"] == "shipped"

    # cleanup — restore each order to its original step individually
    for oid, step in original_steps.items():
        rr = requests.put(f"{API}/tracking/{oid}", json={"step": step}, timeout=15)
        assert rr.status_code == 200


def test_demo_tracking_eta_10_days():
    r = requests.get(f"{API}/tracking/{DEMO_ORDER_ID}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    from datetime import datetime
    created = datetime.fromisoformat(d["created_at"])
    eta_start = datetime.fromisoformat(d["eta_start"])
    delta_days = (eta_start - created).days
    assert delta_days == 10, f"expected +10 days, got +{delta_days}"
    # demo must remain customs
    assert d["tracking_step"] == "customs"
