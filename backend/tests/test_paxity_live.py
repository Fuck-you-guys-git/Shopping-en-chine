"""
Live Paxity integration tests - READ-ONLY (no .env mutation).
Uses REACT_APP_BACKEND_URL to test the public endpoints.
IMPORTANT: WAVESN payin creates a REAL pending transaction on merchant account.
Keep amounts tiny (100 XOF) and don't loop.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def created_order_id():
    """Holder for order id created by WAVESN test, used by tracking test."""
    return {}


class TestPaxityDiagnostic:
    def test_diagnostic_reaches_paxity(self):
        r = requests.get(f"{API}/paxity/diagnostic", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["configured"] is True
        assert d["dns_ok"] is True, f"DNS failed: {d}"
        assert d["http_reachable"] is True, f"HTTP not reachable: {d}"
        assert d["http_status"] == 200, f"http_status={d['http_status']} preview={d.get('response_preview')}"
        assert d["auth_test_status"] == 200, f"auth failed: {d}"
        assert "SHOPPING EN CHINE" in (d.get("response_preview") or ""), \
            f"expected merchant name in preview, got: {d.get('response_preview')}"


class TestPaxityPayinValidation:
    def test_unknown_method(self):
        r = requests.post(f"{API}/paxity/payin", json={
            "amount": 100, "phone_number": "770000000",
            "prefix_phone": "221", "payment_method": "FOOBAR",
            "customer": {"name": "Test"},
        }, timeout=30)
        assert r.status_code == 400
        assert "Méthode de paiement inconnue" in r.json()["detail"]

    def test_zero_amount(self):
        r = requests.post(f"{API}/paxity/payin", json={
            "amount": 0, "phone_number": "770000000",
            "prefix_phone": "221", "payment_method": "WAVESN",
            "customer": {"name": "Test"},
        }, timeout=30)
        assert r.status_code == 400
        assert "Montant invalide" in r.json()["detail"]

    def test_card_method_removed_returns_400(self):
        # CARD is not supported by Paxity (403 ERR_FORBIDDEN upstream) and was
        # removed from PAYMENT_METHODS — must now be rejected as unknown.
        r = requests.post(f"{API}/paxity/payin", json={
            "amount": 100, "phone_number": "770000000",
            "prefix_phone": "221", "payment_method": "CARD",
            "customer": {"name": "Test"},
        }, timeout=30)
        assert r.status_code == 400
        assert "Méthode de paiement inconnue" in r.json()["detail"]

    def test_moovci_method_removed_returns_400(self):
        r = requests.post(f"{API}/paxity/payin", json={
            "amount": 100, "phone_number": "770000000",
            "prefix_phone": "221", "payment_method": "MOOVCI",
            "customer": {"name": "Test"},
        }, timeout=30)
        assert r.status_code == 400
        assert "Méthode de paiement inconnue" in r.json()["detail"]

    def test_config_has_5_methods_no_card_no_otp(self):
        r = requests.get(f"{API}/paxity/config", timeout=15)
        assert r.status_code == 200
        methods = r.json()["methods"]
        codes = {m["code"] for m in methods}
        assert codes == {"OMSN", "OMCI", "WAVESN", "WAVECI", "MTNCI"}, codes
        assert all(m["requires_otp"] is False for m in methods)


class TestPaxityPayinLive:
    def test_wavesn_creates_payment(self, created_order_id):
        r = requests.post(f"{API}/paxity/payin", json={
            "amount": 100, "phone_number": "770000000",
            "prefix_phone": "221", "payment_method": "WAVESN",
            "description": "TEST_wavesn regression",
            "customer": {"name": "TEST_User", "email": "test@example.com", "city": "Dakar"},
            "items": [{"product_id": "p1", "name": "TEST_Item", "price": 100, "qty": 1}],
        }, timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pending", data
        assert data["payment_link"], f"no payment_link: {data}"
        assert data["payment_link"].startswith("https://pay.wave.com/"), data["payment_link"]
        assert data["qr_code"], "empty qr_code"
        # message: 'Payment created with success' (per docs)
        assert data.get("message"), "no message"
        assert "success" in data["message"].lower() or "créé" in data["message"].lower()
        created_order_id["order_id"] = data["order_id"]
        created_order_id["transaction_id"] = data["transaction_id"]

    def test_omsn_with_otp_reaches_paxity(self):
        # OMSN + OTP: should reach paxity. Paxity may return an error (invalid phone/otp)
        # but our OTP guard should NOT block it.
        r = requests.post(f"{API}/paxity/payin", json={
            "amount": 100, "phone_number": "770000000",
            "prefix_phone": "221", "payment_method": "OMSN",
            "otp_code": "123456",
            "description": "TEST_omsn regression",
            "customer": {"name": "TEST_User", "email": "test@example.com"},
        }, timeout=45)
        # Accept either 200 (pending) or a Paxity 4xx forwarded — but NOT our OTP-guard 400
        if r.status_code == 400:
            detail = r.json().get("detail", "")
            assert "OTP" not in detail and "code OTP" not in detail, \
                f"OTP guard fired despite otp_code being present: {detail}"
        else:
            assert r.status_code == 200, r.text
            assert r.json()["status"] == "pending"


class TestTrackingRegression:
    def test_tracking_after_payin(self, created_order_id):
        oid = created_order_id.get("order_id")
        if not oid:
            pytest.skip("No order_id created")
        r = requests.get(f"{API}/tracking/{oid}", timeout=20)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t.get("tracking_step") == "ordered"
        assert t.get("payment_status") == "pending"
