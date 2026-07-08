"""Pure unit tests for Paxity response parsing helpers.

These do NOT touch the network or mutate backend/.env — safe to run anytime.
Covers the nested `data` envelope introduced by the real Paxity API:
    {"code": 201, "message": "...", "data": {"status": "PENDING", ...}}
"""
import sys

sys.path.insert(0, "/app/backend")

from paxity_router import _map_status, _payload_root, _extract_error_message  # noqa: E402


class TestPayloadRoot:
    def test_unwraps_nested_data(self):
        resp = {
            "code": 201,
            "message": "Payment exited with success",
            "data": {
                "status": "PENDING",
                "transactionId": "txn04fd9-d9b9-4a50-9dd7",
                "link": "https://orange-money.example/pay/abc",
                "qrCode": "iVBORw0KGgo=",
            },
        }
        root = _payload_root(resp)
        assert root["status"] == "PENDING"
        assert root["transactionId"] == "txn04fd9-d9b9-4a50-9dd7"
        assert root["link"].startswith("https://")

    def test_falls_back_to_top_level(self):
        resp = {"status": "success", "transactionId": "x1"}
        root = _payload_root(resp)
        assert root["status"] == "success"

    def test_non_dict_returns_empty(self):
        assert _payload_root("boom") == {}
        assert _payload_root(None) == {}


class TestMapStatus:
    def test_pending_variants(self):
        assert _map_status("PENDING") == "pending"
        assert _map_status("processing") == "pending"

    def test_success_variants(self):
        assert _map_status("SUCCESS") == "success"
        assert _map_status("completed") == "success"

    def test_failed_variants(self):
        assert _map_status("FAILED") == "failed"
        assert _map_status("declined") == "failed"

    def test_unknown_is_pending(self):
        assert _map_status("weird_status") == "pending"
        assert _map_status(None) == "pending"


class TestExtractError:
    def test_nested_data_message(self):
        assert _extract_error_message({"data": {"message": "solde insuffisant"}}, 400) == "solde insuffisant"

    def test_top_level_message(self):
        assert _extract_error_message({"message": "bad request"}, 400) == "bad request"

    def test_fallback(self):
        assert "401" in _extract_error_message({}, 401)
        assert "Identifiants Paxity" in _extract_error_message({}, 401)

    def test_generic_status_fallback(self):
        assert "500" in _extract_error_message({}, 500)
