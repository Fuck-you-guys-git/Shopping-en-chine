"""Tests for GET /api/geo endpoint (multi-locale feature)."""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    return s


class TestGeoEndpoint:
    def test_geo_us_ip(self, api):
        r = api.get(f"{BASE_URL}/api/geo", headers={"X-Forwarded-For": "8.8.8.8"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["lang"] == "en"
        assert d["currency"] == "USD"

    def test_geo_eu_ip(self, api):
        r = api.get(f"{BASE_URL}/api/geo", headers={"X-Forwarded-For": "78.46.0.1"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["lang"] == "fr"
        assert d["currency"] == "EUR"

    def test_geo_africa_ip(self, api):
        r = api.get(f"{BASE_URL}/api/geo", headers={"X-Forwarded-For": "41.82.0.1"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["lang"] == "fr"
        assert d["currency"] == "XOF"

    def test_geo_response_shape(self, api):
        r = api.get(f"{BASE_URL}/api/geo", headers={"X-Forwarded-For": "8.8.8.8"}, timeout=15)
        d = r.json()
        for k in ("lang", "currency", "country_code", "continent_code"):
            assert k in d
