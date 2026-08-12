"""
Régression — fixes du retour Wave/OM (IPN + watcher).
Lancer : cd /app/backend && python -m pytest tests/test_paxity_return_fixes.py -q
"""
from unittest.mock import MagicMock

import paxity_router as pr


def _req(headers):
    r = MagicMock()
    r.headers = headers
    return r


def test_ipn_url_derived_from_production_host():
    url = pr._public_ipn_url(_req({
        "x-forwarded-host": "shoppingenchine.com",
        "x-forwarded-proto": "https",
    }))
    assert url == "https://shoppingenchine.com/api/paxity/webhook"


def test_ipn_url_derived_from_preview_host():
    url = pr._public_ipn_url(_req({"host": "paxity-payment-web.preview.emergentagent.com"}))
    assert url == "https://paxity-payment-web.preview.emergentagent.com/api/paxity/webhook"


def test_ipn_url_empty_for_local_hosts():
    for host in ("localhost:8001", "127.0.0.1", "0.0.0.0:8001", "10.0.0.5"):
        assert pr._public_ipn_url(_req({"host": host})) == ""


def test_watch_helpers_exist():
    # Le filet de sécurité serveur doit exister et être une coroutine.
    import inspect
    assert inspect.iscoroutinefunction(pr._watch_pending_tx)
    assert inspect.iscoroutinefunction(pr._refresh_pending_tx)
