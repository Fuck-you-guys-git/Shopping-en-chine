"""Avis clients vérifiés : dépôt (vérification commande payée), doublon,
refus (mauvais email / produit absent / commande impayée), listing public,
synchronisation de la note produit et modération vendeur."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

from creds import SELLER_EMAIL, SELLER_PASSWORD

_BASE = (os.environ.get("REACT_APP_BACKEND_URL")
         or dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL", "")).rstrip("/")
API = f"{_BASE}/api"

PRODUCT_ID = f"p_qa_rev_{uuid.uuid4().hex[:6]}"
ORDER_ID = f"TEST-QA-{uuid.uuid4().hex[:6].upper()}"
EMAIL = "qa.reviews@example.com"


@pytest.fixture(scope="module")
def seller_token() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def seeded(seller_token):
    """Produit + commande payée de test insérés directement en Mongo."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    env = dotenv_values("/app/backend/.env")
    client = AsyncIOMotorClient(env["MONGO_URL"])
    db = client[env["DB_NAME"]]

    async def setup():
        await db.products.insert_one({"id": PRODUCT_ID, "name": "QA Review Product", "price": 1000,
                                      "priceEur": 2, "priceUsd": 2, "category": "mode",
                                      "rating": 5.0, "reviews": 0, "custom": True, "is_test": True})
        await db.orders.insert_one({"id": ORDER_ID, "is_test": True, "status": "success",
                                    "amount": 1000, "currency": "XOF",
                                    "customer": {"name": "Qa Reviewer", "email": EMAIL},
                                    "items": [{"product_id": PRODUCT_ID, "name": "QA Review Product",
                                               "price": 1000, "qty": 1}]})

    async def teardown():
        await db.products.delete_one({"id": PRODUCT_ID})
        await db.orders.delete_one({"id": ORDER_ID})
        await db.reviews.delete_many({"product_id": PRODUCT_ID})

    loop = asyncio.new_event_loop()
    loop.run_until_complete(setup())
    yield db, loop
    loop.run_until_complete(teardown())
    loop.close()


def _submit(**overrides):
    body = {"product_id": PRODUCT_ID, "order_id": ORDER_ID, "email": EMAIL,
            "rating": 4, "comment": "Très bon produit, conforme."}
    body.update(overrides)
    return requests.post(f"{API}/reviews", json=body, timeout=15)


def test_submit_verified_review(seeded):
    r = _submit()
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["verified"] is True
    assert data["rating"] == 4
    assert data["author"] == "Qa R."  # nom raccourci pour la confidentialité


def test_duplicate_review_rejected(seeded):
    r = _submit()
    assert r.status_code == 409


def test_wrong_email_rejected(seeded):
    r = _submit(email="autre@example.com")
    assert r.status_code == 403


def test_unknown_order_rejected(seeded):
    r = _submit(order_id="999999")
    assert r.status_code == 404


def test_product_not_in_order_rejected(seeded):
    r = _submit(product_id="p_inexistant")
    assert r.status_code == 403


def test_public_listing_excludes_test_reviews(seeded):
    """Les avis liés à une commande de TEST ne sont pas montrés au public."""
    r = requests.get(f"{API}/reviews/{PRODUCT_ID}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 0 and data["reviews"] == []


def test_seller_can_delete_review(seeded, seller_token):
    db, loop = seeded
    doc = loop.run_until_complete(db.reviews.find_one({"product_id": PRODUCT_ID}, {"_id": 0, "id": 1}))
    assert doc, "review should exist"
    r = requests.delete(f"{API}/reviews/{doc['id']}",
                        headers={"Authorization": f"Bearer {seller_token}"}, timeout=15)
    assert r.status_code == 200
    # Note produit resynchronisée (plus d'avis → 5.0 / 0)
    p = loop.run_until_complete(db.products.find_one({"id": PRODUCT_ID}, {"_id": 0, "rating": 1, "reviews": 1}))
    assert p["reviews"] == 0 and p["rating"] == 5.0


def test_delete_requires_auth(seeded):
    r = requests.delete(f"{API}/reviews/rev_whatever", timeout=15)
    assert r.status_code in (401, 403)
