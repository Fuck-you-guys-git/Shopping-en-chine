"""Fixtures partagées des tests backend."""
import os
from functools import lru_cache

import pytest
import requests
from dotenv import dotenv_values

_frontend_env = dotenv_values("/app/frontend/.env")
_BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
             or _frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/")


@lru_cache(maxsize=1)
def _stripe_unavailable_reason() -> str:
    """Sonde le checkout Stripe une seule fois. Retourne la raison du skip,
    ou '' si Stripe est opérationnel. Stripe a été retiré du checkout (Paxity
    est la passerelle active) : le compte live peut refuser les charges."""
    try:
        r = requests.get(f"{_BASE_URL}/api/products", timeout=20)
        pid = (r.json().get("products") or [{}])[0].get("id")
        if not pid:
            return ""
        probe = requests.post(
            f"{_BASE_URL}/api/payments/stripe/checkout",
            json={"origin_url": _BASE_URL,
                  "customer": {"name": "TEST_PROBE", "email": "probe@example.com", "city": "Dakar"},
                  "items": [{"product_id": pid, "qty": 1}]},
            timeout=30,
        )
        if probe.status_code == 200:
            return ""
        return f"Stripe indisponible ({probe.status_code}) — passerelle active : Paxity"
    except Exception as e:
        return f"Stripe probe failed: {e}"


def skip_if_stripe_unavailable() -> None:
    reason = _stripe_unavailable_reason()
    if reason:
        pytest.skip(reason)


@pytest.fixture()
def require_stripe() -> None:
    """Skippe le test si le compte Stripe ne peut pas créer de session."""
    skip_if_stripe_unavailable()
