"""Tests for the product catalog (GET /api/products, GET /api/products/{id})."""
import asyncio
import json

from catalog import SEED_FILE, seed_catalog

SEED = json.loads(SEED_FILE.read_text(encoding="utf-8"))


def test_list_products_in_seed_order(client):
    resp = client.get("/api/products")
    assert resp.status_code == 200
    products = resp.json()
    assert [p["id"] for p in products] == [p["id"] for p in SEED]
    first = products[0]
    assert first["price"] == SEED[0]["price"]
    assert first["oldPrice"] == SEED[0]["old_price"]  # frontend spelling
    assert "position" not in first and "_id" not in first


def test_get_product(client):
    resp = client.get(f"/api/products/{SEED[1]['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] == SEED[1]["name"]


def test_get_unknown_product_is_404(client):
    resp = client.get("/api/products/nope")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Produit introuvable"


def test_reseeding_keeps_existing_prices(client, db):
    pid = SEED[0]["id"]
    asyncio.run(db.products.update_one({"id": pid}, {"$set": {"price": 1}}))
    asyncio.run(seed_catalog(db))
    assert client.get(f"/api/products/{pid}").json()["price"] == 1
