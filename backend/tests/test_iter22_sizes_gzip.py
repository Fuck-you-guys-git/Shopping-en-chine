"""Iteration 22 backend tests — sizes on products/orders, GZip, GET /{id}.
"""
import os
from typing import Generator

import pytest
import requests
from dotenv import dotenv_values


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


