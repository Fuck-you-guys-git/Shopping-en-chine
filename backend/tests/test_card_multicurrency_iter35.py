"""Iter 35 — Paiement CARTE multi-devises (EUR/USD) + amount_xof + tracking tmp_.

Couvre :
- POST /api/paxity/card/init en EUR : amount décimal conservé (45.99), currency EUR,
  order_id tmp_xxx ; Mongo : amount=45.99, amount_xof=24350, items[0].price_paid=45.99, is_test=True
- POST /api/paxity/card/init en XOF : amount entier, amount_xof=amount
- GET /api/tracking/{tmp_id} : 200 (fix _normalize_order_id), currency/amount/price_paid
- POST /api/paxity/payin : méthode inconnue -> 400 (régression, aucun vrai payin)
- Nettoyage : suppression des orders + paxity_transactions créés
"""
import os

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = (os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")).strip('"')
DB_NAME = (os.environ.get("DB_NAME") or backend_env.get("DB_NAME")).strip('"')

CREATED_ORDERS: list[str] = []


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module", autouse=True)
def cleanup(mongo):
    yield
    for oid in CREATED_ORDERS:
        mongo.orders.delete_many({"id": oid})
        mongo.paxity_transactions.delete_many({"order_id": oid})
    print(f"[cleanup] removed {len(CREATED_ORDERS)} test orders: {CREATED_ORDERS}")


def _card_init(body: dict) -> requests.Response:
    return requests.post(f"{BASE_URL}/api/paxity/card/init", json=body, timeout=40)


EUR_BODY = {
    "amount": 45.99,
    "currency": "EUR",
    "base_amount_xof": 24350,
    "description": "TEST_QA iter35 EUR",
    "customer": {"name": "TEST_QA EU", "email": "qa@test.dev", "city": "Paris"},
    "items": [{"product_id": "p1", "name": "TEST_QA Sac", "price": 24350, "qty": 1, "price_paid": 45.99}],
}

XOF_BODY = {
    "amount": 24350,
    "currency": "XOF",
    "description": "TEST_QA iter35 XOF",
    "customer": {"name": "TEST_QA SN", "email": "qa@test.dev", "city": "Dakar"},
    "items": [{"product_id": "p1", "name": "TEST_QA Sac", "price": 24350, "qty": 1}],
}


class TestCardInitMultiCurrency:
    """POST /api/paxity/card/init — devises EUR et XOF."""

    def test_card_init_eur_keeps_decimals(self, mongo):
        r = _card_init(EUR_BODY)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        oid = data["order_id"]
        CREATED_ORDERS.append(oid)

        assert oid.startswith("tmp_"), f"order_id inattendu: {oid}"
        assert data["amount"] == 45.99, f"amount tronqué: {data['amount']}"
        assert data["currency"] == "EUR"
        assert data["status"] == "pending"
        assert isinstance(data.get("ipn"), str) and data["ipn"]
        assert data.get("credentials", {}).get("apikey")

        order = mongo.orders.find_one({"id": oid}, {"_id": 0})
        assert order, "commande absente en Mongo"
        assert order["amount"] == 45.99
        assert order["amount_xof"] == 24350
        assert order["currency"] == "EUR"
        assert order["items"][0]["price_paid"] == 45.99
        assert order["is_test"] is True
        assert order["status"] == "pending"

        tx = mongo.paxity_transactions.find_one({"order_id": oid}, {"_id": 0})
        assert tx and tx["amount"] == 45.99 and tx["currency"] == "EUR"
        assert tx["payment_method"] == "CARD"

    def test_card_init_xof_integer_amount(self, mongo):
        r = _card_init(XOF_BODY)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        oid = data["order_id"]
        CREATED_ORDERS.append(oid)

        assert data["currency"] == "XOF"
        assert data["amount"] == 24350
        assert isinstance(data["amount"], int), f"XOF doit être un entier: {data['amount']!r}"

        order = mongo.orders.find_one({"id": oid}, {"_id": 0})
        assert order["amount_xof"] == 24350
        assert order["currency"] == "XOF"

    def test_card_init_rejects_zero_amount(self):
        body = dict(EUR_BODY, amount=0)
        r = _card_init(body)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"


class TestTrackingTmpOrder:
    """GET /api/tracking/{tmp_...} — fix du préfixe ord_."""

    def test_tracking_tmp_order_eur(self):
        r = _card_init(EUR_BODY)
        assert r.status_code == 200
        oid = r.json()["order_id"]
        CREATED_ORDERS.append(oid)

        t = requests.get(f"{BASE_URL}/api/tracking/{oid}", timeout=30)
        assert t.status_code == 200, f"tracking {t.status_code} {t.text[:300]}"
        body = t.json()
        assert body["order_id"] == oid
        assert body["currency"] == "EUR"
        assert body["amount"] == 45.99
        assert body["items"][0]["price_paid"] == 45.99
        assert body["tracking_step"] == "ordered"
        assert body["tracking_step_index"] == 0
        assert body["city"] == "Paris"

    def test_tracking_unknown_order_404(self):
        r = requests.get(f"{BASE_URL}/api/tracking/tmp_doesnotexist99", timeout=30)
        assert r.status_code == 404


class TestPayinRegression:
    """POST /api/paxity/payin — validation seulement (aucune vraie transaction)."""

    def test_unknown_method_400(self):
        r = requests.post(
            f"{BASE_URL}/api/paxity/payin",
            json={"amount": 100, "phone_number": "770000000", "payment_method": "BOGUSPAY",
                  "customer": {"name": "TEST_QA", "email": "qa@test.dev", "city": "Dakar"},
                  "items": []},
            timeout=30,
        )
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"
        assert "inconnue" in r.text.lower() or "unknown" in r.text.lower()

    def test_negative_amount_400(self):
        r = requests.post(
            f"{BASE_URL}/api/paxity/payin",
            json={"amount": -5, "phone_number": "770000000", "payment_method": "WAVESN",
                  "customer": {"name": "TEST_QA", "email": "qa@test.dev", "city": "Dakar"},
                  "items": []},
            timeout=30,
        )
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"
