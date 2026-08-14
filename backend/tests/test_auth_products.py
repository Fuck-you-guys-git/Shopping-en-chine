"""Backend tests for auth + products routers (iteration 18)."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

# Identifiants vendeur chargés depuis l'environnement (voir tests/creds.py)
from creds import SELLER_EMAIL, SELLER_PASSWORD


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == SELLER_EMAIL
    return data["token"]


@pytest.fixture()
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Auth --------------------------------------------------------------
class TestAuth:
    def test_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": SELLER_EMAIL, "password": "WRONG_PASS_xxx"})
        assert r.status_code == 401

    def test_me_without_token(self, api):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == SELLER_EMAIL


# --- Products ----------------------------------------------------------
class TestProducts:
    def test_list_public(self, api):
        r = api.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        data = r.json()
        assert "products" in data and isinstance(data["products"], list)
        assert data["count"] == len(data["products"])

    def test_create_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/products",
                     json={"name": "TEST_no_auth", "category": "tech", "price": 100})
        assert r.status_code in (401, 403)

    def test_update_requires_auth(self, api):
        r = api.put(f"{BASE_URL}/api/products/p1",
                    json={"name": "x", "category": "tech", "price": 1})
        assert r.status_code in (401, 403)

    def test_delete_requires_auth(self, api):
        r = api.delete(f"{BASE_URL}/api/products/p1")
        assert r.status_code in (401, 403)

    def test_crud_full_flow(self, auth_headers):
        # CREATE
        payload = {
            "name": "TEST_E2E_backend_product",
            "category": "Tech",
            "price": 4999,
            "image": "https://placehold.co/400",
            "description": "Backend test product",
            "colors": ["Noir"],
        }
        r = requests.post(f"{BASE_URL}/api/products", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert created["price"] == payload["price"]
        assert created["id"].startswith("p_")
        assert created.get("custom") == True
        pid = created["id"]

        # GET (verify persistence)
        r = requests.get(f"{BASE_URL}/api/products")
        ids = [p["id"] for p in r.json()["products"]]
        assert pid in ids

        # UPDATE
        upd = {**payload, "name": "TEST_E2E_backend_product_UPDATED", "price": 5999}
        r = requests.put(f"{BASE_URL}/api/products/{pid}", json=upd, headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_E2E_backend_product_UPDATED"
        assert r.json()["price"] == 5999

        # DELETE
        r = requests.delete(f"{BASE_URL}/api/products/{pid}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["deleted"] == pid

        # Verify gone
        r = requests.get(f"{BASE_URL}/api/products")
        ids = [p["id"] for p in r.json()["products"]]
        assert pid not in ids

    def test_update_nonexistent_404(self, auth_headers):
        r = requests.put(f"{BASE_URL}/api/products/does_not_exist_zzz",
                         json={"name": "TEST_valid_name", "category": "c", "price": 1},
                         headers=auth_headers)
        assert r.status_code == 404
