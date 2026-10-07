"""Tests for the seller area API (/api/admin)."""
import pytest

import admin
from test_orders import ORDER, order_with

PASSWORD = "correct horse battery staple"


@pytest.fixture(autouse=True)
def fresh_throttle(monkeypatch):
    monkeypatch.setattr(admin, "_failures", admin.deque())
    monkeypatch.setattr(admin.asyncio, "sleep", _no_sleep)


async def _no_sleep(_seconds):
    return None


@pytest.fixture()
def auth(client):
    token = client.post("/api/admin/login", json={"email": "owner@example.com", "password": PASSWORD}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_login(client):
    resp = client.post("/api/admin/login", json={"email": " OWNER@example.com ", "password": PASSWORD})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "owner@example.com" and body["name"] == "Propriétaire" and body["token"]


@pytest.mark.parametrize("email,password", [("owner@example.com", "wrong"), ("other@example.com", PASSWORD)])
def test_login_rejects_bad_credentials(client, email, password):
    resp = client.post("/api/admin/login", json={"email": email, "password": password})
    assert resp.status_code == 401
    assert "token" not in resp.json()


def test_login_is_throttled_after_repeated_failures(client):
    for _ in range(admin.MAX_FAILURES):
        client.post("/api/admin/login", json={"email": "owner@example.com", "password": "nope"})
    resp = client.post("/api/admin/login", json={"email": "owner@example.com", "password": PASSWORD})
    assert resp.status_code == 429


def test_seller_area_disabled_without_credentials(client, monkeypatch):
    monkeypatch.delenv("ADMIN_PASSWORD")
    assert client.post("/api/admin/login", json={"email": "owner@example.com", "password": PASSWORD}).status_code == 503


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer not-a-token"}, {"Authorization": "Basic abc"}],
)
def test_admin_routes_need_a_valid_token(client, headers):
    assert client.get("/api/admin/orders", headers=headers).status_code == 401
    assert client.get("/api/admin/me", headers=headers).status_code == 401


def test_changing_the_password_signs_sessions_out(client, auth, monkeypatch):
    assert client.get("/api/admin/me", headers=auth).status_code == 200
    monkeypatch.setenv("ADMIN_PASSWORD", "a brand new password")
    assert client.get("/api/admin/me", headers=auth).status_code == 401


def test_list_orders_newest_first_with_customer_details(client, auth):
    first = client.post("/api/orders", json=ORDER).json()
    second = client.post("/api/orders", json=order_with(payment_method="mobile_money")).json()
    orders = client.get("/api/admin/orders", headers=auth).json()
    assert [o["id"] for o in orders] == [second["id"], first["id"]]
    assert orders[0]["customer"]["phone"] == ORDER["customer"]["phone"]


def test_update_order_status(client, auth):
    order = client.post("/api/orders", json=order_with(payment_method="mobile_money")).json()
    resp = client.patch(f"/api/admin/orders/{order['id']}", json={"status": "confirmée"}, headers=auth)
    assert resp.status_code == 200 and resp.json()["status"] == "confirmée"
    assert client.patch(f"/api/admin/orders/{order['id']}", json={"status": "volée"}, headers=auth).status_code == 422
    assert client.patch("/api/admin/orders/SEC-NOPE", json={"status": "livrée"}, headers=auth).status_code == 404


def test_product_crud_changes_the_shop_and_its_prices(client, auth):
    new = {"name": "Lampe Lotus", "category": "maison", "price": 21000, "image": "https://example.com/lampe.jpg"}
    created = client.post("/api/admin/products", json=new, headers=auth)
    assert created.status_code == 201
    pid = created.json()["id"]
    assert client.get("/api/products").json()[0]["id"] == pid  # new products come first

    updated = client.put(f"/api/admin/products/{pid}", json={**new, "price": 19000}, headers=auth)
    assert updated.json()["price"] == 19000
    order = client.post("/api/orders", json=order_with(items=[{"product_id": pid, "qty": 1}])).json()
    assert order["subtotal"] == 19000

    assert client.delete(f"/api/admin/products/{pid}", headers=auth).status_code == 204
    assert client.get(f"/api/products/{pid}").status_code == 404
    assert client.delete(f"/api/admin/products/{pid}", headers=auth).status_code == 404


def test_product_input_is_validated(client, auth):
    bad = {"name": "X", "category": "voitures", "price": 0, "image": "https://example.com/x.jpg"}
    assert client.post("/api/admin/products", json=bad, headers=auth).status_code == 422


def test_product_routes_need_a_token(client):
    new = {"name": "Lampe", "category": "maison", "price": 1000, "image": "https://example.com/l.jpg"}
    assert client.post("/api/admin/products", json=new).status_code == 401
    assert client.delete("/api/admin/products/p1").status_code == 401
