"""Non-regression tests for _process_images (MD5 -> SHA-256 change for image versioning)."""
import os
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")

from creds import SELLER_EMAIL, SELLER_PASSWORD

# 1x1 PNG
PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def test_full_flow():
    s = requests.Session()

    # Login
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token returned: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})

    # Create product with image
    payload = {
        "name": "TEST_sha256_img",
        "description": "Non-regression test for SHA-256 image versioning",
        "price": 9.99,
        "category": "test",
        "stock": 1,
        "image": PNG_DATA_URL,
    }
    r = s.post(f"{BASE_URL}/api/products", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"Create product failed: {r.status_code} {r.text[:500]}"
    prod = r.json()
    pid = prod.get("id") or prod.get("_id") or prod.get("product_id")
    assert pid, f"No product id: {prod}"
    image_url = prod.get("image")
    assert image_url, f"Product has no image field: {prod}"
    assert "/api/products/" in image_url, f"Unexpected image URL: {image_url}"
    # Assert SHA-256 truncated (8 hex chars) suffix present via v= query if in images[] URL
    images = prod.get("images") or []
    assert images, f"images[] empty: {prod}"
    assert "v=" in images[0], f"Version suffix missing: {images[0]}"
    v_val = images[0].split("v=")[-1]
    assert len(v_val) == 8 and all(c in "0123456789abcdef" for c in v_val), f"v param not 8 hex chars: {v_val}"

    try:
        # GET the image URL
        full_img = image_url if image_url.startswith("http") else f"{BASE_URL}{image_url}"
        r = requests.get(full_img, timeout=30)
        assert r.status_code == 200, f"Image thumb GET failed: {r.status_code}"
        assert r.headers.get("content-type", "").startswith("image/"), f"Bad content-type: {r.headers.get('content-type')}"

        # GET full image url from images[]
        full_img2 = images[0] if images[0].startswith("http") else f"{BASE_URL}{images[0]}"
        r = requests.get(full_img2, timeout=30)
        assert r.status_code == 200, f"Full image GET failed: {r.status_code}"
        assert r.headers.get("content-type", "").startswith("image/"), f"Bad content-type: {r.headers.get('content-type')}"

        # List products and verify our product is present
        r = s.get(f"{BASE_URL}/api/products", timeout=30)
        assert r.status_code == 200
        products = r.json() if isinstance(r.json(), list) else r.json().get("products") or r.json().get("items") or []
        matching = [p for p in products if (p.get("id") or p.get("_id")) == pid]
        assert matching, f"Created product not found in list"
        assert matching[0].get("image"), "Product in list has no image"

        # Existing products still have accessible images
        existing_with_img = [p for p in products if p.get("image") and (p.get("id") or p.get("_id")) != pid]
        checked = 0
        for p in existing_with_img[:5]:
            img = p["image"]
            url = img if img.startswith("http") else f"{BASE_URL}{img}"
            r = requests.get(url, timeout=30)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                checked += 1
            else:
                print(f"WARN existing product {p.get('name')} image {url} -> {r.status_code} {r.headers.get('content-type')}")
        print(f"Checked {checked}/{len(existing_with_img[:5])} existing product images OK")
        assert checked == len(existing_with_img[:5]), "Some existing product images broken"

        # Look for 'Embedded test' explicitly if present
        embedded = [p for p in products if "embedded" in (p.get("name") or "").lower()]
        for p in embedded:
            if p.get("image"):
                url = p["image"] if p["image"].startswith("http") else f"{BASE_URL}{p['image']}"
                r = requests.get(url, timeout=30)
                assert r.status_code == 200, f"'Embedded test' image broken: {url} -> {r.status_code}"
                print(f"'Embedded test' image OK: {url}")

    finally:
        # Cleanup
        r = s.delete(f"{BASE_URL}/api/products/{pid}", timeout=30)
        assert r.status_code in (200, 204), f"Delete failed: {r.status_code} {r.text[:200]}"
