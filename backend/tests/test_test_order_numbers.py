"""Régression : les commandes de TEST (preview/localhost) ne consomment jamais
un vrai numéro de commande — elles reçoivent TEST-xxx et des emails [TEST]."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from email_service import _order_no, _test_tag  # noqa: E402
from paxity_router import _is_test_env  # noqa: E402


class FakeRequest:
    def __init__(self, host):
        self.headers = {"x-forwarded-host": host}


def test_is_test_env_preview_true():
    assert _is_test_env(FakeRequest("paxity-payment-web.preview.emergentagent.com")) == True


def test_is_test_env_localhost_true():
    assert _is_test_env(FakeRequest("localhost:3000")) == True


def test_is_test_env_production_false():
    assert _is_test_env(FakeRequest("shoppingenchine.com")) == False
    assert _is_test_env(FakeRequest("www.shoppingenchine.com")) == False


def test_order_no_formats_test_ids():
    assert _order_no("TEST-101") == "#TEST-101"
    assert _order_no("1254") == "#1254"


def test_email_test_tag():
    assert _test_tag({"id": "TEST-101"}) == "[TEST] "
    assert _test_tag({"id": "tmp_abc", "is_test": True}) == "[TEST] "
    assert _test_tag({"id": "1254"}) == ""
    assert _test_tag({"id": "1254", "is_test": False}) == ""
