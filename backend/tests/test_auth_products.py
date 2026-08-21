"""Backend tests for auth + products routers (iteration 18).
CRUD découpé en petits tests ciblés (1 scénario = 1 test) via fixtures."""
import os
from typing import Generator

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    from dotenv import dotenv_values
    BASE_URL = dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Identifiants vendeur chargés depuis l'environnement (voir tests/creds.py)
from creds import SELLER_EMAIL, SELLER_PASSWORD  # noqa: E402


@pytest.fixture(scope="module")
def api() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(api: requests.Session) -> str:
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": SELLER_EMAIL, "password": SELLER_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == SELLER_EMAIL
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Auth --------------------------------------------------------------
class TestAuth:
    def test_login_wrong_password(self, api: requests.Session) -> None:
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": SELLER_EMAIL, "password": "WRONG_PASS_xxx"})
        assert r.status_code == 401

    def test_me_without_token(self, api: requests.Session) -> None:
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, auth_headers: dict) -> None:
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == SELLER_EMAIL


# --- Products : accès non authentifié ------------------------------------
class TestProductsPublic:
    def test_list_public(self, api: requests.Session) -> None:
        r = api.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        data = r.json()
        assert "products" in data and isinstance(data["products"], list)
        assert data["count"] == len(data["products"])

    def test_create_requires_auth(self, api: requests.Session) -> None:
        r = api.post(f"{BASE_URL}/api/products",
                     json={"name": "TEST_no_auth", "category": "tech", "price": 100})
        assert r.status_code in (401, 403)

    def test_update_requires_auth(self, api: requests.Session) -> None:
        r = api.put(f"{BASE_URL}/api/products/p1",
                    json={"name": "x", "category": "tech", "price": 1})
        assert r.status_code in (401, 403)

    def test_delete_requires_auth(self, api: requests.Session) -> None:
        r = api.delete(f"{BASE_URL}/api/products/p1")
        assert r.status_code in (401, 403)


# --- Products : CRUD (1 étape = 1 test, état partagé via fixture module) --
CRUD_PAYLOAD: dict = {
    "name": "TEST_E2E_backend_product",
    "category": "Tech",
    "price": 4999,
    "image": "https://placehold.co/400",
    "description": "Backend test product",
    "colors": ["Noir"],
}


@pytest.fixture(scope="module")
def created_product(auth_headers: dict) -> Generator[dict, None, None]:
    """Crée le produit de test ; le supprime en fin de module s'il existe encore."""
    r = requests.post(f"{BASE_URL}/api/products", json=CRUD_PAYLOAD, headers=auth_headers)
    assert r.status_code == 201, r.text
    created = r.json()
    yield created
    requests.delete(f"{BASE_URL}/api/products/{created['id']}", headers=auth_headers)


class TestProductsCrud:
    def test_create_returns_created_product(self, created_product: dict) -> None:
        assert created_product["name"] == CRUD_PAYLOAD["name"]
        assert created_product["price"] == CRUD_PAYLOAD["price"]
        assert created_product["id"].startswith("p_")
        assert created_product.get("custom") == True

    def test_created_product_visible_in_list(self, created_product: dict) -> None:
        r = requests.get(f"{BASE_URL}/api/products")
        ids = [p["id"] for p in r.json()["products"]]
        assert created_product["id"] in ids

    def test_update_product(self, created_product: dict, auth_headers: dict) -> None:
        upd = {**CRUD_PAYLOAD, "name": "TEST_E2E_backend_product_UPDATED", "price": 5999}
        r = requests.put(f"{BASE_URL}/api/products/{created_product['id']}",
                         json=upd, headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_E2E_backend_product_UPDATED"
        assert r.json()["price"] == 5999

    def test_delete_product_then_absent_from_list(self, created_product: dict, auth_headers: dict) -> None:
        pid = created_product["id"]
        r = requests.delete(f"{BASE_URL}/api/products/{pid}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["deleted"] == pid
        r = requests.get(f"{BASE_URL}/api/products")
        assert pid not in [p["id"] for p in r.json()["products"]]

    def test_update_nonexistent_404(self, auth_headers: dict) -> None:
        r = requests.put(f"{BASE_URL}/api/products/does_not_exist_zzz",
                         json={"name": "TEST_valid_name", "category": "c", "price": 1},
                         headers=auth_headers)
        assert r.status_code == 404
