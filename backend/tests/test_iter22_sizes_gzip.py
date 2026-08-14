"""Iteration 22 backend tests — sizes on products/orders, GZip, GET /{id}.
Scénario Stripe découpé en petits tests via fixture module (session + commande)."""
import os
from typing import Generator

import pytest
import requests
from dotenv import dotenv_values

from conftest import skip_if_stripe_unavailable

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
BASE_URL = base_url.rstrip("/")

from creds import SELLER_EMAIL, SELLER_PASSWORD  # noqa: E402


@pytest.fixture(scope="module")
def seller_token() -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def created_product_ids() -> Generator[list, None, None]:
    ids: list = []
    yield ids
    # cleanup
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD})
    tok = r.json().get("token") or r.json().get("access_token")
    h = {"Authorization": f"Bearer {tok}"}
    for pid in ids:
        requests.delete(f"{BASE_URL}/api/products/{pid}", headers=h)


# Products list — no 'images', but has 'image', 'sizes', 'keywords'
class TestProductsListSlim:
    def test_list_products_excludes_images(self) -> None:
        r = requests.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        data = r.json()
        assert "products" in data
        for p in data["products"]:
            assert "images" not in p, f"Product {p.get('id')} still has 'images' in list response"

    def test_gzip_encoding(self) -> None:
        r = requests.get(
            f"{BASE_URL}/api/products",
            headers={"Accept-Encoding": "gzip"},
            stream=True,
        )
        assert r.status_code == 200
        ce = r.headers.get("Content-Encoding", "")
        raw = requests.get(f"{BASE_URL}/api/products", headers={"Accept-Encoding": "gzip"})
        assert raw.status_code == 200
        # Si la réponse est assez grosse, gzip attendu (les proxys peuvent l'omettre sinon)
        if len(raw.content) > 1024 or ce:
            assert "gzip" in ce.lower() or "gzip" in raw.headers.get("Content-Encoding", "").lower(), \
                f"Expected gzip Content-Encoding, got: {raw.headers}"


# POST product with sizes + verify GET /{id} full detail with images
class TestProductSizesRoundTrip:
    def test_create_product_with_sizes_and_get_by_id(self, seller_token: str, created_product_ids: list) -> None:
        h = {"Authorization": f"Bearer {seller_token}"}
        payload = {
            "name": "TEST_QA iter22 tailles",
            "category": "mode",
            "subcategory": "chaussures",
            "price": 12500,
            "image": "https://example.com/img.png",
            "images": ["https://example.com/img1.png", "https://example.com/img2.png"],
            "description": "Produit de test iter22",
            "colors": ["#000000"],
            "sizes": ["M", "XL", "40"],
            "keywords": ["test", "iter22", "tailles"],
        }
        r = requests.post(f"{BASE_URL}/api/products", json=payload, headers=h)
        assert r.status_code == 201, f"Create failed: {r.status_code} {r.text[:300]}"
        pid = r.json()["id"]
        created_product_ids.append(pid)

        # List shouldn't contain 'images' but should contain 'sizes' and 'keywords'
        lst = requests.get(f"{BASE_URL}/api/products").json()["products"]
        item = next((p for p in lst if p["id"] == pid), None)
        assert item is not None, "Created product missing from list"
        assert "images" not in item
        assert item.get("sizes") == ["M", "XL", "40"]
        assert item.get("keywords") == ["test", "iter22", "tailles"]
        # Depuis la refonte du stockage d'images, `image` = miniature de images[0]
        assert item.get("image"), "Main image missing from list payload"

        # Full detail via /{id}
        r2 = requests.get(f"{BASE_URL}/api/products/{pid}")
        assert r2.status_code == 200
        full = r2.json()
        assert full.get("images") == ["https://example.com/img1.png", "https://example.com/img2.png"]
        assert full.get("sizes") == ["M", "XL", "40"]
        assert full.get("keywords") == ["test", "iter22", "tailles"]

    def test_get_nonexistent_product_404(self) -> None:
        r = requests.get(f"{BASE_URL}/api/products/does_not_exist_zzz")
        assert r.status_code == 404


# --- Stripe checkout : items[].name doit contenir ' — Taille X' -----------
@pytest.fixture(scope="module")
def stripe_size_checkout(seller_token: str, created_product_ids: list) -> dict:
    """Crée un produit avec tailles + une session de checkout Stripe (taille M).
    Skippe tout le scénario si le compte Stripe est indisponible."""
    skip_if_stripe_unavailable()
    h = {"Authorization": f"Bearer {seller_token}"}
    r = requests.post(f"{BASE_URL}/api/products", json={
        "name": "TEST_QA stripe size",
        "category": "mode",
        "price": 5000,
        "image": "https://example.com/x.png",
        "sizes": ["M", "L"],
    }, headers=h)
    assert r.status_code == 201
    pid = r.json()["id"]
    created_product_ids.append(pid)

    r = requests.post(f"{BASE_URL}/api/payments/stripe/checkout", json={
        "origin_url": BASE_URL,
        "customer": {"name": "TEST_QA", "email": "qa@test.com", "city": "Dakar"},
        "items": [{"product_id": pid, "qty": 1, "size": "M"}],
    })
    assert r.status_code == 200, f"Checkout failed: {r.status_code} {r.text[:300]}"
    return r.json()


class TestStripeCheckoutWithSize:
    def test_checkout_returns_session_and_order(self, stripe_size_checkout: dict) -> None:
        # Checkout Stripe embarqué (ui_mode="embedded") : client_secret présent,
        # checkout_url peut être None (pas de redirection externe).
        assert stripe_size_checkout.get("client_secret") or stripe_size_checkout.get("checkout_url")
        assert stripe_size_checkout.get("order_id")

    def test_order_item_name_contains_size(self, stripe_size_checkout: dict, seller_token: str) -> None:
        order_id = stripe_size_checkout["order_id"]
        oh = {"Authorization": f"Bearer {seller_token}"}
        ords = requests.get(f"{BASE_URL}/api/orders", headers=oh)
        assert ords.status_code == 200, f"orders fetch failed: {ords.status_code}"
        arr = ords.json() if isinstance(ords.json(), list) else ords.json().get("orders", [])
        found = next((o for o in arr if o.get("id") == order_id), None)
        assert found is not None, f"Order {order_id} not found in /api/orders"
        item_names = [it.get("name", "") for it in found.get("items", [])]
        assert any(" — Taille M" in n for n in item_names), f"No ' — Taille M' in items: {item_names}"
