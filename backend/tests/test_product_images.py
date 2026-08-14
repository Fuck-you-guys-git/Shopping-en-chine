"""Non-regression tests for _process_images (SHA-256 image versioning).
Découpé en petits tests ciblés (1 scénario = 1 test) via fixtures pytest."""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")

from creds import SELLER_EMAIL, SELLER_PASSWORD  # noqa: E402

# 1x1 PNG
PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def _abs(url: str) -> str:
    return url if url.startswith("http") else f"{BASE_URL}{url}"


@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token returned: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def product(session: requests.Session) -> dict:
    """Crée le produit de test avec image, le supprime en fin de module."""
    payload = {
        "name": "TEST_sha256_img",
        "description": "Non-regression test for SHA-256 image versioning",
        "price": 9.99,
        "category": "test",
        "stock": 1,
        "image": PNG_DATA_URL,
    }
    r = session.post(f"{BASE_URL}/api/products", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"Create product failed: {r.status_code} {r.text[:500]}"
    prod = r.json()
    yield prod
    pid = prod.get("id")
    r = session.delete(f"{BASE_URL}/api/products/{pid}", timeout=30)
    assert r.status_code in (200, 204), f"Delete failed: {r.status_code} {r.text[:200]}"


def test_create_returns_stored_image_url(product: dict) -> None:
    assert product.get("id"), f"No product id: {product}"
    image_url = product.get("image")
    assert image_url, f"Product has no image field: {product}"
    assert "/api/products/" in image_url, f"Unexpected image URL: {image_url}"


def test_version_param_is_8_hex_chars(product: dict) -> None:
    images = product.get("images") or []
    assert images, f"images[] empty: {product}"
    assert "v=" in images[0], f"Version suffix missing: {images[0]}"
    v_val = images[0].split("v=")[-1]
    assert len(v_val) == 8 and all(c in "0123456789abcdef" for c in v_val), \
        f"v param not 8 hex chars: {v_val}"


def test_thumb_image_is_served(product: dict) -> None:
    r = requests.get(_abs(product["image"]), timeout=30)
    assert r.status_code == 200, f"Image thumb GET failed: {r.status_code}"
    assert r.headers.get("content-type", "").startswith("image/"), \
        f"Bad content-type: {r.headers.get('content-type')}"


def test_full_image_is_served(product: dict) -> None:
    images = product.get("images") or []
    r = requests.get(_abs(images[0]), timeout=30)
    assert r.status_code == 200, f"Full image GET failed: {r.status_code}"
    assert r.headers.get("content-type", "").startswith("image/"), \
        f"Bad content-type: {r.headers.get('content-type')}"


def _list_products(session: requests.Session) -> list:
    r = session.get(f"{BASE_URL}/api/products", timeout=30)
    assert r.status_code == 200
    body = r.json()
    return body if isinstance(body, list) else body.get("products") or body.get("items") or []


def test_product_appears_in_list_with_image(session: requests.Session, product: dict) -> None:
    pid = product.get("id")
    matching = [p for p in _list_products(session) if p.get("id") == pid]
    assert matching, "Created product not found in list"
    assert matching[0].get("image"), "Product in list has no image"


def test_existing_product_images_still_served(session: requests.Session, product: dict) -> None:
    pid = product.get("id")
    products = _list_products(session)
    existing = [p for p in products if p.get("image") and p.get("id") != pid][:5]
    for p in existing:
        r = requests.get(_abs(p["image"]), timeout=30)
        assert r.status_code == 200, f"Existing image broken: {p.get('name')} -> {r.status_code}"
        assert r.headers.get("content-type", "").startswith("image/")
