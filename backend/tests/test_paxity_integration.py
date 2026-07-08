"""Integration tests for Paxity endpoints against the running backend.

Uses REACT_APP_BACKEND_URL from /app/frontend/.env (public URL).
Does NOT mutate backend/.env — safe.
"""
import os
import pytest
import requests

# Load public URL from frontend/.env
BASE_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

API = f"{BASE_URL}/api"


def _customer():
    return {"name": "TEST User", "email": "test@example.com", "city": "Dakar"}


# ---- /api/paxity/config ----
class TestConfig:
    def test_config_shape(self):
        r = requests.get(f"{API}/paxity/config", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["configured"] is True
        assert d["currency"] == "XOF"
        assert len(d["methods"]) == 7
        by_code = {m["code"]: m for m in d["methods"]}
        assert by_code["OMSN"]["requires_otp"] is True
        assert by_code["OMCI"]["requires_otp"] is True
        for c in ["WAVESN", "WAVECI", "MTNCI", "MOOVCI", "CARD"]:
            assert by_code[c]["requires_otp"] is False, f"{c} should not require OTP"


# ---- /api/paxity/payin validation ----
class TestPayinValidation:
    def test_omsn_missing_otp_returns_400_french(self):
        payload = {
            "amount": 1000,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": "OMSN",
            "customer": _customer(),
            "items": [],
        }
        r = requests.post(f"{API}/paxity/payin", json=payload, timeout=20)
        assert r.status_code == 400, r.text
        detail = r.json()["detail"]
        assert "code OTP" in detail
        assert "Orange Money Sénégal" in detail

    def test_unknown_method_returns_400(self):
        payload = {
            "amount": 1000,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": "BOGUS",
            "customer": _customer(),
        }
        r = requests.post(f"{API}/paxity/payin", json=payload, timeout=20)
        assert r.status_code == 400
        assert "Méthode de paiement inconnue" in r.json()["detail"]

    def test_zero_amount_returns_400(self):
        payload = {
            "amount": 0,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": "WAVESN",
            "customer": _customer(),
        }
        r = requests.post(f"{API}/paxity/payin", json=payload, timeout=20)
        assert r.status_code == 400
        assert "Montant invalide" in r.json()["detail"]


# ---- /api/paxity/payin against real Paxity (expect 401 with clean French detail) ----
class TestPayinLive401:
    def test_wavesn_returns_clean_french_401(self):
        payload = {
            "amount": 1000,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": "WAVESN",
            "customer": _customer(),
            "items": [],
        }
        r = requests.post(f"{API}/paxity/payin", json=payload, timeout=45)
        # Must NOT be a 500 crash
        assert r.status_code != 500, f"Backend crashed: {r.text}"
        # Content must be JSON, not HTML/Cloudflare
        ct = r.headers.get("content-type", "")
        assert "application/json" in ct, f"Non-JSON response: {ct} body={r.text[:200]}"
        # Expected: 401 with French message
        assert r.status_code == 401, f"Expected 401 from Paxity rejection, got {r.status_code}: {r.text[:300]}"
        detail = r.json().get("detail", "")
        assert detail.startswith("Identifiants Paxity refusés (401)"), f"Unexpected detail: {detail!r}"


# ---- /api/paxity/status/{id} ----
class TestStatus:
    def test_status_not_found_returns_404(self):
        r = requests.get(f"{API}/paxity/status/tx_does_not_exist_zzz", timeout=15)
        assert r.status_code == 404
        assert r.json()["detail"] == "Transaction introuvable"


# ---- /api/paxity/diagnostic ----
class TestDiagnostic:
    def test_diagnostic_reaches_paxity_but_auth_401(self):
        r = requests.get(f"{API}/paxity/diagnostic", timeout=45)
        assert r.status_code == 200
        d = r.json()
        assert d["host"] == "api.paxity.io"
        assert d["dns_ok"] is True
        assert d["http_reachable"] is True
        assert d["auth_test_status"] == 401
