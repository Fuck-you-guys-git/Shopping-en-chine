"""Iteration 19: seller /api/orders and /api/orders/bulk-tracking tests.
Scénarios bulk découpés : mise à jour / vérification tracking / restauration (fixture)."""
import os
from datetime import datetime
from typing import Generator

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paxity-payment-web.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
from creds import SELLER_EMAIL, SELLER_PASSWORD  # noqa: E402
DEMO_ORDER_ID = "ord_demo12345678"


@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_orders_requires_auth() -> None:
    r = requests.get(f"{API}/orders", timeout=15)
    assert r.status_code == 401


def test_orders_list(auth_headers: dict) -> None:
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


def test_bulk_tracking_requires_auth() -> None:
    r = requests.put(f"{API}/orders/bulk-tracking", json={"order_ids": ["x"], "step": "shipped"}, timeout=15)
    assert r.status_code == 401


def test_bulk_tracking_invalid_step(auth_headers: dict) -> None:
    r = requests.put(f"{API}/orders/bulk-tracking", headers=auth_headers,
                     json={"order_ids": ["ord_x"], "step": "bogus"}, timeout=15)
    assert r.status_code == 400


@pytest.fixture(scope="module")
def bulk_targets(auth_headers: dict) -> Generator[list, None, None]:
    """2 commandes réelles (hors démo) ; restaure leur étape de suivi en fin de module."""
    r = requests.get(f"{API}/orders", headers=auth_headers, timeout=15)
    orders = r.json()["orders"]
    candidates = [o for o in orders if o["id"] != DEMO_ORDER_ID][:2]
    assert len(candidates) == 2, "need at least 2 real orders for bulk test"
    original_steps = {o["id"]: (o.get("tracking_step") or "ordered") for o in candidates}
    yield [o["id"] for o in candidates]
    for oid, step in original_steps.items():
        rr = requests.put(f"{API}/tracking/{oid}", json={"step": step}, timeout=15)
        assert rr.status_code == 200


def test_bulk_tracking_updates_two_orders(bulk_targets: list, auth_headers: dict) -> None:
    r = requests.put(f"{API}/orders/bulk-tracking", headers=auth_headers,
                     json={"order_ids": bulk_targets, "step": "shipped"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["updated"] == 2
    assert body["step"] == "shipped"


def test_bulk_tracking_visible_in_public_tracking(bulk_targets: list, auth_headers: dict) -> None:
    for oid in bulk_targets:
        t = requests.get(f"{API}/tracking/{oid}", timeout=15)
        assert t.status_code == 200
        assert t.json()["tracking_step"] == "shipped"


def test_demo_tracking_eta_10_days() -> None:
    r = requests.get(f"{API}/tracking/{DEMO_ORDER_ID}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    created = datetime.fromisoformat(d["created_at"])
    eta_start = datetime.fromisoformat(d["eta_start"])
    delta_days = (eta_start - created).days
    assert delta_days == 10, f"expected +10 days, got +{delta_days}"
    # demo must remain customs
    assert d["tracking_step"] == "customs"
