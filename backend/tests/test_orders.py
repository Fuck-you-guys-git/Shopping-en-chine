"""Tests for the orders API (POST /api/orders, GET /api/orders/{id}).

MongoDB is replaced by an in-memory mock (mongomock-motor), so these run
without a database server.
"""
import os

import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

# server.py reads these at import time
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "shopping_en_chine_test")

import server  # noqa: E402


ORDER_PAYLOAD = {
    "customer": {
        "first_name": "Marie",
        "last_name": "Dupont",
        "email": "marie@exemple.com",
        "phone": "77 123 45 67",
        "address": "Rue 10, Plateau",
        "zip": "10000",
        "city": "Dakar",
    },
    "items": [
        {"product_id": "p1", "name": "Casque", "price": 12500, "qty": 2},
        {"product_id": "p2", "name": "Montre", "price": 4000, "qty": 1},
    ],
    "shipping": 3000,
}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(server, "db", AsyncMongoMockClient()["shopping_en_chine_test"])
    with TestClient(server.app) as c:
        yield c


def test_create_order_computes_totals_server_side(client):
    resp = client.post("/api/orders", json=ORDER_PAYLOAD)
    assert resp.status_code == 201, resp.text
    order = resp.json()
    assert order["id"].startswith("SEC-")
    assert order["subtotal"] == 12500 * 2 + 4000
    assert order["shipping"] == 3000
    assert order["total"] == 29000 + 3000
    assert order["currency"] == "XOF"
    assert order["status"] == "confirmée"
    assert order["payment"] == "à la livraison"
    assert order["customer"]["city"] == "Dakar"


def test_get_order_roundtrip(client):
    created = client.post("/api/orders", json=ORDER_PAYLOAD).json()
    resp = client.get(f"/api/orders/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]
    assert resp.json()["total"] == created["total"]


def test_get_unknown_order_is_404(client):
    resp = client.get("/api/orders/SEC-DOESNOTEXIST")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Commande introuvable"


def test_order_requires_at_least_one_item(client):
    resp = client.post("/api/orders", json={**ORDER_PAYLOAD, "items": []})
    assert resp.status_code == 422
