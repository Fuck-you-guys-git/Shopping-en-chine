"""
Iteration 9 tests: CARD/MOOVCI removed; OTP now optional for OMSN/OMCI.
IMPORTANT: The OMSN no-OTP live payin test creates a REAL 100 XOF transaction.
It is gated by RUN_LIVE_OMSN env var and only runs ONCE per suite invocation.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paxity-payment-web.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"name": "TEST Marie Dupont", "email": "marie@exemple.com", "city": "Dakar"}


def _payload(method, otp=None, amount=100, phone="770000000", prefix="221"):
    body = {
        "amount": amount,
        "phone_number": phone,
        "prefix_phone": prefix,
        "payment_method": method,
        "description": "TEST regression suite",
        "customer": CUSTOMER,
        "items": [],
    }
    if otp is not None:
        body["otp_code"] = otp
    return body


# ---- Config ----
class TestConfig:
    def test_config_exactly_5_methods_no_card_no_moovci(self):
        r = requests.get(f"{API}/paxity/config", timeout=15)
        assert r.status_code == 200
        data = r.json()
        codes = [m["code"] for m in data["methods"]]
        assert set(codes) == {"OMSN", "OMCI", "WAVESN", "WAVECI", "MTNCI"}, f"Got {codes}"
        assert "CARD" not in codes
        assert "MOOVCI" not in codes
        assert len(codes) == 5

    def test_config_all_requires_otp_false(self):
        r = requests.get(f"{API}/paxity/config", timeout=15)
        assert r.status_code == 200
        for m in r.json()["methods"]:
            assert m["requires_otp"] is False, f"{m['code']} requires_otp={m['requires_otp']}"


# ---- Validation (no live Paxity call reached) ----
class TestValidation:
    def test_card_returns_400_unknown_method(self):
        r = requests.post(f"{API}/paxity/payin", json=_payload("CARD"), timeout=20)
        assert r.status_code == 400
        assert "Méthode de paiement inconnue" in r.json()["detail"]
        assert "CARD" in r.json()["detail"]

    def test_moovci_returns_400_unknown_method(self):
        r = requests.post(f"{API}/paxity/payin", json=_payload("MOOVCI"), timeout=20)
        assert r.status_code == 400
        assert "Méthode de paiement inconnue" in r.json()["detail"]

    def test_foobar_returns_400_unknown_method(self):
        r = requests.post(f"{API}/paxity/payin", json=_payload("FOOBAR"), timeout=20)
        assert r.status_code == 400
        assert "Méthode de paiement inconnue" in r.json()["detail"]

    def test_amount_zero_returns_400(self):
        r = requests.post(f"{API}/paxity/payin", json=_payload("OMSN", amount=0), timeout=20)
        assert r.status_code == 400
        assert "Montant invalide" in r.json()["detail"]


# ---- Live OMSN no-OTP payin (creates a real 100 XOF pending tx) ----
@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_OMSN") != "1",
    reason="Skipped: set RUN_LIVE_OMSN=1 to run the ONE live OMSN payin",
)
class TestLiveOMSNNoOTP:
    def test_omsn_no_otp_succeeds_pending_with_link_and_qr(self):
        # NO otp_code at all — verifies requires_otp=False path
        r = requests.post(f"{API}/paxity/payin", json=_payload("OMSN"), timeout=45)
        assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
        data = r.json()
        assert data["status"] == "pending", f"status={data['status']}"
        assert data.get("payment_link"), "payment_link missing"
        assert "orange" in data["payment_link"].lower() or "sonatel" in data["payment_link"].lower(), \
            f"unexpected link host: {data['payment_link']}"
        assert data.get("qr_code"), "qr_code empty"
        assert data.get("requires_otp") is False
