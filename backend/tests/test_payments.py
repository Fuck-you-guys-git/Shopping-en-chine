"""Tests for currencies, Paxity amounts and the payment endpoints."""
import pytest

from money import to_minor_units
from test_orders import ORDER, order_with


def test_minor_units():
    assert to_minor_units(25000, "XOF") == 2500000  # F CFA x 100
    assert to_minor_units(655957, "EUR") == 100000  # 1 000,00 EUR at the legal peg
    assert to_minor_units(85000, "EUR") == 12958  # 129,58 EUR
    assert to_minor_units(85000, "USD") == 14167  # 141,67 $ at 600 F/$


def test_config_exposes_rates_and_paxity(client):
    config = client.get("/api/payments/config").json()
    assert config["currencies"] == {"XOF": 1.0, "EUR": 655.957, "USD": 600.0}
    assert config["paxity"] == {"enabled": True, "org_id": "org-test"}


def test_config_without_org_id_disables_paxity(client, monkeypatch):
    monkeypatch.delenv("PAXITY_ORG_ID")
    assert client.get("/api/payments/config").json()["paxity"] == {"enabled": False, "org_id": None}


@pytest.mark.parametrize(
    "method,currency,amount_minor",
    [("mobile_money", "XOF", 8500000), ("carte", "EUR", 12958), ("carte", "USD", 14167)],
)
def test_online_order_amount(client, method, currency, amount_minor):
    payload = order_with(items=[{"product_id": "p1", "qty": 1}], payment_method=method, payment_currency=currency)
    order = client.post("/api/orders", json=payload).json()
    assert order["total"] == 85000  # totals stay in F CFA
    assert order["payment_currency"] == currency
    assert order["amount_minor"] == amount_minor
    assert order["status"] == "en attente de paiement"


def test_cash_on_delivery_has_no_paxity_amount(client):
    assert client.post("/api/orders", json=ORDER).json()["amount_minor"] is None


@pytest.mark.parametrize(
    "method,currency",
    [("mobile_money", "EUR"), ("mobile_money", "USD"), ("livraison", "EUR"), ("carte", "XOF")],
)
def test_currency_must_fit_method(client, method, currency):
    resp = client.post("/api/orders", json=order_with(payment_method=method, payment_currency=currency))
    assert resp.status_code == 422


def test_online_payment_needs_org_id(client, monkeypatch):
    monkeypatch.delenv("PAXITY_ORG_ID")
    resp = client.post("/api/orders", json=order_with(payment_method="mobile_money"))
    assert resp.status_code == 503
    assert client.post("/api/orders", json=ORDER).status_code == 201  # cash on delivery still works


def test_reported_payment_needs_verification(client):
    order = client.post("/api/orders", json=order_with(payment_method="mobile_money")).json()
    resp = client.post(f"/api/payments/paxity/{order['id']}/reported")
    assert resp.status_code == 200
    assert resp.json()["status"] == "paiement à vérifier"


def test_report_cannot_change_cash_orders(client):
    order = client.post("/api/orders", json=ORDER).json()
    resp = client.post(f"/api/payments/paxity/{order['id']}/reported")
    assert resp.json()["status"] == "confirmée"


def test_report_unknown_order_is_404(client):
    assert client.post("/api/payments/paxity/SEC-NOPE/reported").status_code == 404
