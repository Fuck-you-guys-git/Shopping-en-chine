"""Tests for email_service (Resend integration) - iter 25.

Resend is in TEST MODE: only delivers to MERCHANT_EMAIL (owner). Any
other recipient is rejected. Tests verify the idempotency + release
behavior around that.

Uses asyncio.run instead of pytest-asyncio to avoid xdist finalizer
conflict with pytest-asyncio's module-scoped event loop.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND_DIR = Path("/app/backend")
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

from email_service import (  # noqa: E402
    maybe_send_customer_confirmation,
    maybe_send_order_confirmation,
    _wrap,
    _order_html,
)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
MERCHANT_EMAIL = os.environ["MERCHANT_EMAIL"]

ORDER_OK_ID = "9991"
ORDER_BAD_ID = "9992"


def _order_doc(order_id: str, email: str) -> dict:
    return {
        "id": order_id,
        "status": "success",
        "amount": 9000,
        "payment_method": "test",
        "items": [{"name": "Produit Test", "qty": 1, "price": 9000}],
        "customer": {
            "name": "Test Client",
            "email": email,
            "phone": "771234567",
            "address": "Rue 10",
            "city": "Dakar",
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.new_event_loop().run_until_complete(coro)


class TestEmailService:
    """Full lifecycle for the two email helpers used by the payment routers."""

    @classmethod
    def setup_class(cls):
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        cls.client = AsyncIOMotorClient(MONGO_URL)
        cls.db = cls.client[DB_NAME]
        cls.loop.run_until_complete(
            cls.db.orders.delete_many({"id": {"$in": [ORDER_OK_ID, ORDER_BAD_ID]}})
        )

    @classmethod
    def teardown_class(cls):
        cls.loop.run_until_complete(
            cls.db.orders.delete_many({"id": {"$in": [ORDER_OK_ID, ORDER_BAD_ID]}})
        )
        cls.client.close()
        cls.loop.close()

    def test_1_customer_confirmation_happy_path(self):
        """Send customer email to MERCHANT_EMAIL (allowed by Resend test mode)."""
        async def run():
            await self.db.orders.insert_one(_order_doc(ORDER_OK_ID, MERCHANT_EMAIL))
            ok = await maybe_send_customer_confirmation(self.db, ORDER_OK_ID)
            assert ok is True, "Resend should accept owner's own email"
            doc = await self.db.orders.find_one({"id": ORDER_OK_ID}, {"_id": 0})
            assert doc["customer_email_sent"] is True
            assert doc["customer"]["email"] == MERCHANT_EMAIL
        self.loop.run_until_complete(run())

    def test_2_customer_confirmation_idempotent(self):
        """Second call returns False (no duplicate email)."""
        async def run():
            ok = await maybe_send_customer_confirmation(self.db, ORDER_OK_ID)
            assert ok is False
        self.loop.run_until_complete(run())

    def test_3_merchant_confirmation_and_idempotent(self):
        """Merchant email → MERCHANT_EMAIL; second call is no-op."""
        async def run():
            ok = await maybe_send_order_confirmation(self.db, ORDER_OK_ID)
            assert ok is True
            doc = await self.db.orders.find_one({"id": ORDER_OK_ID}, {"_id": 0})
            assert doc["confirmation_email_sent"] is True
            ok2 = await maybe_send_order_confirmation(self.db, ORDER_OK_ID)
            assert ok2 is False
        self.loop.run_until_complete(run())

    def test_4_resend_test_mode_rejects_third_party(self):
        """Non-owner recipient → False; flag released so retry stays possible."""
        async def run():
            await self.db.orders.insert_one(_order_doc(ORDER_BAD_ID, "someone.else@example.com"))
            ok = await maybe_send_customer_confirmation(self.db, ORDER_BAD_ID)
            assert ok is False, (
                "Expected False — Resend test mode rejects non-owner recipients "
                "(this is why real customers get no email until domain is verified)"
            )
            doc = await self.db.orders.find_one({"id": ORDER_BAD_ID}, {"_id": 0})
            assert doc["customer_email_sent"] is False, (
                "Flag must be released after failure so a later retry can succeed"
            )
        self.loop.run_until_complete(run())

    def test_5_html_contains_branding(self):
        """Rendered HTML sanity check."""
        order = _order_doc(ORDER_OK_ID, MERCHANT_EMAIL)
        merchant_html = _order_html(order)
        assert "Shopping en Chine" in merchant_html
        assert "Total payé" in merchant_html
        assert "9 000 F CFA" in merchant_html
        wrapped = _wrap("<p>hello</p>")
        assert "SHOPPING EN CHINE" in wrapped
        assert "hello" in wrapped
