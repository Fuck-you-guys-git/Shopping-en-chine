"""Paxity payment integration tests — Phases 1-4."""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # Fallback: read frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api/paxity"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ============ /config ============
class TestConfig:
    def test_config_shape(self, s):
        r = s.get(f"{API}/config", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "configured" in data
        assert "methods" in data
        assert data.get("currency") == "XOF"
        assert data.get("default_prefix") == "221"
        methods = data["methods"]
        assert len(methods) == 7
        codes = {m["code"]: m for m in methods}
        # requires_otp values
        assert codes["OMSN"]["requires_otp"] is True
        assert codes["OMCI"]["requires_otp"] is True
        for c in ("WAVESN", "WAVECI", "MTNCI", "MOOVCI", "CARD"):
            assert codes[c]["requires_otp"] is False, f"{c} should not require OTP"

    def test_config_unconfigured(self, s):
        # In the default .env, keys are empty but PAXITY_BASE_URL is set
        r = s.get(f"{API}/config", timeout=15)
        data = r.json()
        # When KEY/TOKEN are empty, configured stays False even though URL is set
        assert data["configured"] is False
        assert data["base_url_set"] is True


# ============ /diagnostic (unconfigured — keys empty, URL set) ============
class TestDiagnosticUnconfigured:
    def test_diagnostic_no_hardcoded_com(self, s):
        r = s.get(f"{API}/diagnostic", timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Base URL now defaults to api.paxity.io (the real host); never .com
        assert "api.paxity.com" not in (data.get("host") or "")
        assert "api.paxity.com" not in (data.get("base_url") or "")
        # DNS should resolve for api.paxity.io
        assert data["dns_ok"] is True, f"DNS should succeed for {data.get('host')}: {data.get('http_error')}"
        assert data["host"] == "api.paxity.io"
        # HTTP reachable (Paxity replies 401 to an unauthenticated GET, which is fine)
        assert data["http_reachable"] is True


# ============ /payin (unconfigured) ============
class TestPayinUnconfigured:
    def _payload(self, method="WAVESN", amount=1000, otp=None):
        return {
            "amount": amount,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": method,
            "otp_code": otp,
            "description": "test",
            "customer": {"name": "Test User", "email": "t@example.com"},
            "items": [],
        }

    def test_payin_503_when_unconfigured(self, s):
        r = s.post(f"{API}/payin", json=self._payload(), timeout=15)
        assert r.status_code == 503
        detail = r.json().get("detail", "")
        assert "PAXITY_API_KEY" in detail
        assert "PAXITY_API_TOKEN" in detail
        # PAXITY_BASE_URL is set by default in .env, so only KEY/TOKEN are listed
        assert "Paxity n'est pas configuré" in detail


# ============ /status/{id} ============
class TestStatus:
    def test_status_not_found(self, s):
        r = s.get(f"{API}/status/tx_doesnotexist_{uuid.uuid4().hex[:6]}", timeout=15)
        assert r.status_code == 404
        assert r.json().get("detail") == "Transaction introuvable"


# ============ Configured-with-bogus-host tests ============
BOGUS_URL = "https://nonexistent-paxity-host-for-test.example/v1"
ENV_FILE = "/app/backend/.env"


def _set_env(base_url, key="test", token="test"):
    lines = []
    with open(ENV_FILE) as f:
        for line in f:
            if line.startswith("PAXITY_BASE_URL="):
                lines.append(f'PAXITY_BASE_URL="{base_url}"\n')
            elif line.startswith("PAXITY_API_KEY="):
                lines.append(f'PAXITY_API_KEY="{key}"\n')
            elif line.startswith("PAXITY_API_TOKEN="):
                lines.append(f'PAXITY_API_TOKEN="{token}"\n')
            else:
                lines.append(line)
    with open(ENV_FILE, "w") as f:
        f.writelines(lines)
    os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
    # Wait for backend to be up
    import time
    for _ in range(30):
        try:
            r = requests.get(f"{API}/config", timeout=5)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(1)


DEFAULT_URL = "https://api.paxity.io/v1"


@pytest.fixture(scope="module")
def bogus_config():
    """Configure with bogus PAXITY_BASE_URL, run tests, restore to real default."""
    _set_env(BOGUS_URL, "test_key", "test_token")
    yield
    _set_env(DEFAULT_URL, "", "")


class TestBogusConfigured:
    def test_diagnostic_reports_bogus_host(self, s, bogus_config):
        r = s.get(f"{API}/diagnostic", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["host"] == "nonexistent-paxity-host-for-test.example"
        assert data["dns_ok"] is False
        assert "nonexistent-paxity-host-for-test.example" in (data.get("http_error") or "")
        # No hardcoded paxity.com
        assert "api.paxity.com" not in (data.get("http_error") or "")

    def test_payin_omsn_missing_otp(self, s, bogus_config):
        r = s.post(f"{API}/payin", json={
            "amount": 1000,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": "OMSN",
            "description": "test",
            "customer": {"name": "Test", "email": "t@x.com"},
            "items": [],
        }, timeout=30)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "OTP" in detail
        assert "Orange Money Sénégal" in detail

    def test_payin_unknown_method(self, s, bogus_config):
        r = s.post(f"{API}/payin", json={
            "amount": 1000,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": "NOPE",
            "description": "test",
            "customer": {"name": "Test"},
            "items": [],
        }, timeout=30)
        assert r.status_code == 400
        assert "Méthode de paiement inconnue" in r.json().get("detail", "")

    def test_payin_invalid_amount(self, s, bogus_config):
        r = s.post(f"{API}/payin", json={
            "amount": 0,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": "WAVESN",
            "description": "test",
            "customer": {"name": "Test"},
            "items": [],
        }, timeout=30)
        assert r.status_code == 400
        assert "Montant invalide" in r.json().get("detail", "")

    def test_payin_wavesn_no_otp_proceeds_to_transport(self, s, bogus_config):
        # WAVESN doesn't require OTP -> should proceed and fail with 502 transport
        # NOTE: We hit localhost:8001 directly because Cloudflare replaces 5xx
        # response bodies from origin with its own HTML error page, so testing
        # the JSON detail through the public URL is impossible.
        r = requests.post("http://localhost:8001/api/paxity/payin", json={
            "amount": 1000,
            "phone_number": "770000000",
            "prefix_phone": "221",
            "payment_method": "WAVESN",
            "description": "test",
            "customer": {"name": "Test"},
            "items": [],
        }, timeout=90)
        assert r.status_code == 424, f"expected 424, got {r.status_code}: {r.text[:300]}"
        detail = r.json().get("detail", "")
        # Should mention a real transport error (not generic)
        assert detail and detail != "Aucune réponse de Paxity" or "nonexistent" in detail.lower() or "resolve" in detail.lower() or "connecterror" in detail.lower() or "ConnectError" in detail
        # Basically: some real transport-level indicator
        assert any(kw in detail for kw in ("ConnectError", "resolve", "nonexistent", "getaddrinfo", "Name or service", "Timeout")), f"detail={detail}"

    def test_webhook_processing_maps_to_pending(self, s, bogus_config):
        # Seed a transaction directly in mongo
        mongo_url = "mongodb://localhost:27017"
        db_name = "test_database"
        with open(ENV_FILE) as f:
            for line in f:
                if line.startswith("MONGO_URL="):
                    mongo_url = line.split("=", 1)[1].strip().strip('"')
                if line.startswith("DB_NAME="):
                    db_name = line.split("=", 1)[1].strip().strip('"')
        client = MongoClient(mongo_url)
        db = client[db_name]
        order_id = f"ord_test_{uuid.uuid4().hex[:8]}"
        tx_id = f"tx_test_{uuid.uuid4().hex[:8]}"
        db.paxity_transactions.insert_one({
            "id": tx_id,
            "order_id": order_id,
            "amount": 1000,
            "currency": "XOF",
            "payment_method": "WAVESN",
            "phone_number": "770000000",
            "prefix_phone": "221",
            "status": "pending",
            "customer_name": "Seed",
            "description": "seed",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        })
        db.orders.insert_one({"id": order_id, "status": "pending"})
        try:
            r = s.post(f"{API}/webhook", json={
                "status": "processing",
                "idClient": order_id,
            }, timeout=15)
            assert r.status_code == 200
            assert r.json() == {"received": True}
            # Verify status mapped to 'pending'
            tx = db.paxity_transactions.find_one({"id": tx_id})
            assert tx["status"] == "pending"
        finally:
            db.paxity_transactions.delete_one({"id": tx_id})
            db.orders.delete_one({"id": order_id})
