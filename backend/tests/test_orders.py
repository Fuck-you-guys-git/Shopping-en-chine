"""Tests for the orders API (POST /api/orders, GET /api/orders/{id})."""
import copy

CUSTOMER = {
    "first_name": "Marie",
    "last_name": "Dupont",
    "email": "marie@exemple.com",
    "phone": "77 123 45 67",
    "address": "Rue 10, Plateau",
    "zip": "10000",
    "city": "Dakar",
    "country": "SN",
}

# p1 = 85 000 F, p2 = 12 000 F in backend/data/products.json
ORDER = {
    "customer": CUSTOMER,
    "items": [{"product_id": "p1", "qty": 2}, {"product_id": "p2", "qty": 1}],
    "shipping_method": "standard",
}


def order_with(**changes):
    payload = copy.deepcopy(ORDER)
    payload.update(changes)
    return payload


def test_totals_use_catalog_prices(client):
    resp = client.post("/api/orders", json=ORDER)
    assert resp.status_code == 201, resp.text
    order = resp.json()
    assert order["id"].startswith("SEC-")
    assert [(i["product_id"], i["price"], i["qty"]) for i in order["items"]] == [("p1", 85000, 2), ("p2", 12000, 1)]
    assert order["subtotal"] == 182000
    assert order["shipping"] == 0  # standard is free from 30 000 F
    assert order["total"] == 182000
    assert order["currency"] == "XOF"


def test_client_sent_prices_are_ignored(client):
    tampered = order_with(items=[{"product_id": "p1", "qty": 1, "price": 0, "name": "Gratuit"}])
    order = client.post("/api/orders", json=tampered).json()
    assert order["items"][0]["price"] == 85000
    assert order["items"][0]["name"] == "Casque sans fil Aura Pro"
    assert order["total"] == 85000


def test_unknown_product_is_rejected(client):
    resp = client.post("/api/orders", json=order_with(items=[{"product_id": "p999", "qty": 1}]))
    assert resp.status_code == 422
    assert resp.json()["detail"] == "Produit inconnu : p999"


def test_shipping_rules(client):
    def total_for(items, method):
        resp = client.post("/api/orders", json=order_with(items=items, shipping_method=method))
        assert resp.status_code == 201, resp.text
        return resp.json()["shipping"], resp.json()["total"]

    cheap = [{"product_id": "p2", "qty": 1}]  # 12 000 F, under the free-shipping threshold
    assert total_for(cheap, "standard") == (3000, 15000)
    assert total_for(cheap, "express") == (5000, 17000)
    assert total_for(cheap, "relais") == (2000, 14000)
    assert total_for([{"product_id": "p1", "qty": 1}], "express") == (5000, 90000)


def test_cash_on_delivery_is_confirmed(client):
    order = client.post("/api/orders", json=ORDER).json()
    assert order["payment_method"] == "livraison"
    assert order["status"] == "confirmée"


def test_online_payment_starts_pending(client):
    order = client.post("/api/orders", json=order_with(payment_method="mobile_money")).json()
    assert order["status"] == "en attente de paiement"


def test_invalid_input_is_422(client):
    assert client.post("/api/orders", json=order_with(items=[])).status_code == 422
    assert client.post("/api/orders", json=order_with(items=[{"product_id": "p1", "qty": 0}])).status_code == 422
    assert client.post("/api/orders", json=order_with(shipping_method="drone")).status_code == 422
    bad_country = order_with(customer={**CUSTOMER, "country": "FR"})
    assert client.post("/api/orders", json=bad_country).status_code == 422
    blank_name = order_with(customer={**CUSTOMER, "first_name": "   "})
    assert client.post("/api/orders", json=blank_name).status_code == 422


def test_order_lookup_hides_customer_details(client):
    created = client.post("/api/orders", json=ORDER).json()
    resp = client.get(f"/api/orders/{created['id']}")
    assert resp.status_code == 200
    assert resp.json() == {
        "id": created["id"],
        "status": "confirmée",
        "total": created["total"],
        "currency": "XOF",
        "payment_method": "livraison",
    }


def test_unknown_order_is_404(client):
    resp = client.get("/api/orders/SEC-DOESNOTEXIST")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Commande introuvable"
