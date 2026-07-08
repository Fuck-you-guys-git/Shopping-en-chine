"""Tests for the order tracking API (Où est mon colis ?)."""
import os
import uuid
import requests
from pymongo import MongoClient

BASE_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api/tracking"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"
with open("/app/backend/.env") as f:
    for line in f:
        if line.startswith("MONGO_URL="):
            MONGO_URL = line.split("=", 1)[1].strip().strip('"')
        if line.startswith("DB_NAME="):
            DB_NAME = line.split("=", 1)[1].strip().strip('"')


def _seed_order():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    order_id = f"ord_test{uuid.uuid4().hex[:8]}"
    db.orders.insert_one({
        "id": order_id,
        "customer": {"name": "Test Client", "email": "t@x.com", "city": "Dakar"},
        "items": [{"product_id": "p1", "name": "Casque Aura Pro", "price": 85000, "qty": 1}],
        "amount": 85000,
        "currency": "XOF",
        "status": "pending",
        "payment_method": "WAVESN",
        "transaction_id": "tx_test",
        "created_at": "2026-02-01T10:00:00+00:00",
        "tracking_step": "ordered",
        "tracking_history": [{"step": "ordered", "at": "2026-02-01T10:00:00+00:00"}],
    })
    return db, order_id


def _cleanup(db, order_id):
    db.orders.delete_one({"id": order_id})


class TestTrackingSteps:
    def test_steps_list(self):
        r = requests.get(f"{API}/steps", timeout=15)
        assert r.status_code == 200
        steps = r.json()["steps"]
        assert [s["code"] for s in steps] == ["ordered", "shipped", "customs", "delivery", "delivered"]
        assert steps[1]["label"] == "Expédié de Chine"
        assert steps[3]["label"] == "En livraison à Dakar"


class TestTrackOrder:
    def test_track_found(self):
        db, order_id = _seed_order()
        try:
            r = requests.get(f"{API}/{order_id}", timeout=15)
            assert r.status_code == 200
            data = r.json()
            assert data["order_id"] == order_id
            assert data["tracking_step"] == "ordered"
            assert data["tracking_step_index"] == 0
            assert data["delivered"] is False
            assert data["amount"] == 85000
            assert data["city"] == "Dakar"
            assert len(data["steps"]) == 5
            # ETA = created + 15 / + 20 days
            assert data["eta_start"].startswith("2026-02-16")
            assert data["eta_end"].startswith("2026-02-21")
        finally:
            _cleanup(db, order_id)

    def test_track_without_prefix(self):
        db, order_id = _seed_order()
        try:
            bare = order_id[len("ord_"):]
            r = requests.get(f"{API}/{bare}", timeout=15)
            assert r.status_code == 200
            assert r.json()["order_id"] == order_id
        finally:
            _cleanup(db, order_id)

    def test_track_not_found(self):
        r = requests.get(f"{API}/ord_doesnotexist{uuid.uuid4().hex[:6]}", timeout=15)
        assert r.status_code == 404
        assert "introuvable" in r.json()["detail"]


class TestUpdateTracking:
    def test_update_step_and_history(self):
        db, order_id = _seed_order()
        try:
            r = requests.put(f"{API}/{order_id}", json={"step": "shipped"}, timeout=15)
            assert r.status_code == 200
            assert r.json()["label"] == "Expédié de Chine"
            # Verify via public lookup
            r2 = requests.get(f"{API}/{order_id}", timeout=15)
            data = r2.json()
            assert data["tracking_step"] == "shipped"
            assert data["tracking_step_index"] == 1
            assert data["tracking_history"][-1]["step"] == "shipped"
            # Advance to delivered
            requests.put(f"{API}/{order_id}", json={"step": "delivered"}, timeout=15)
            r3 = requests.get(f"{API}/{order_id}", timeout=15)
            assert r3.json()["delivered"] is True
        finally:
            _cleanup(db, order_id)

    def test_update_invalid_step(self):
        db, order_id = _seed_order()
        try:
            r = requests.put(f"{API}/{order_id}", json={"step": "teleported"}, timeout=15)
            assert r.status_code == 400
            assert "Étape inconnue" in r.json()["detail"]
        finally:
            _cleanup(db, order_id)

    def test_update_not_found(self):
        r = requests.put(f"{API}/ord_nope{uuid.uuid4().hex[:6]}", json={"step": "shipped"}, timeout=15)
        assert r.status_code == 404
