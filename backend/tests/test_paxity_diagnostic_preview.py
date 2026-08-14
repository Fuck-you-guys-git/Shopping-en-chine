"""
Preview backend verification for Paxity fix (deployment-lag confirmation).
READ-ONLY diagnostic + VALIDATION-only payin tests. NO real transactions.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paxity-payment-web.preview.emergentagent.com").rstrip("/")


def test_diagnostic_shows_fixed_base_url_and_200():
    r = requests.get(f"{BASE_URL}/api/paxity/diagnostic", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    print("DIAGNOSTIC:", data)
    assert data.get("base_url") == "https://transaction.paxity.io/api/v1", f"base_url wrong: {data.get('base_url')}"
    assert data.get("host") == "transaction.paxity.io"
    assert data.get("http_status") == 200
    assert data.get("auth_test_status") == 200
    preview = str(data.get("response_preview") or data.get("body_preview") or data)
    assert "SHOPPING EN CHINE" in preview.upper() or "shopping en chine" in preview.lower(), f"marker missing: {preview[:300]}"


def test_config_endpoint():
    r = requests.get(f"{BASE_URL}/api/paxity/config", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("configured") == True
    assert data.get("currency") == "XOF"
    methods = data.get("methods") or data.get("payment_methods") or []
    assert len(methods) == 5, f"expected 5 methods, got {len(methods)}: {methods}"


CUSTOMER = {"name": "Test User", "first_name": "Test", "last_name": "User", "email": "test@example.com"}


def test_payin_unknown_method_returns_400():
    payload = {"payment_method": "UNKNOWN_XYZ", "amount": 1000, "phone_number": "+22500000000", "customer": CUSTOMER}
    r = requests.post(f"{BASE_URL}/api/paxity/payin", json=payload, timeout=15)
    assert r.status_code == 400, r.text
    assert "inconnue" in r.text.lower() or "unknown" in r.text.lower()


def test_payin_amount_zero_returns_400():
    payload = {"payment_method": "WAVESN", "amount": 0, "phone_number": "+22500000000", "customer": CUSTOMER}
    r = requests.post(f"{BASE_URL}/api/paxity/payin", json=payload, timeout=15)
    assert r.status_code == 400, r.text
    assert "invalide" in r.text.lower() or "invalid" in r.text.lower()


def test_payin_card_removed_returns_400():
    # CARD is not supported by the Paxity merchant account (403 upstream) —
    # removed from the app, must be rejected as unknown.
    payload = {"payment_method": "CARD", "amount": 1000, "phone_number": "+22500000000", "customer": CUSTOMER}
    r = requests.post(f"{BASE_URL}/api/paxity/payin", json=payload, timeout=15)
    assert r.status_code == 400, r.text
    assert "inconnue" in r.text.lower()
