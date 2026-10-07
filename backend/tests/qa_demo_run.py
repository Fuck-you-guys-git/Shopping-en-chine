"""One-shot QA run with NEW Resend key (iteration 26).

Sends AT MOST 1 real email (to MERCHANT_EMAIL = commands@shoppingenchine.com,
which is the only allowed recipient in Resend test mode). Then verifies
idempotency and cleans up the demo order.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND_DIR = Path("/app/backend")
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

from email_service import maybe_send_customer_confirmation  # noqa: E402

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
MERCHANT_EMAIL = os.environ["MERCHANT_EMAIL"]
ORDER_ID = "demo_qa"


async def main() -> int:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    results = {}
    try:
        # Fresh state
        await db.orders.delete_many({"id": ORDER_ID})

        await db.orders.insert_one({
            "id": ORDER_ID,
            "status": "success",
            "amount": 17500,
            "payment_method": "test",
            "items": [{"name": "Article QA", "qty": 1, "price": 17500}],
            "customer": {
                "name": "QA",
                "email": MERCHANT_EMAIL,
                "phone": "770000000",
                "address": "Sicap Mbao",
                "city": "Dakar",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # 1) First call: expect True + flag set
        first = await maybe_send_customer_confirmation(db, ORDER_ID)
        doc = await db.orders.find_one({"id": ORDER_ID}, {"_id": 0})
        flag = doc.get("customer_email_sent")
        results["first_call_return"] = first
        results["customer_email_sent_flag"] = flag

        # 2) Second call: expect False (idempotent)
        second = await maybe_send_customer_confirmation(db, ORDER_ID)
        results["second_call_return"] = second

        # 3) Cleanup
        deleted = await db.orders.delete_one({"id": ORDER_ID})
        results["deleted_count"] = deleted.deleted_count

        ok = (first == True and flag == True and second == False and deleted.deleted_count == 1)
        results["ALL_PASS"] = ok
        for k, v in results.items():
            print(f"{k}: {v}")
        return 0 if ok else 1
    finally:
        # Safety: ensure cleanup even on unexpected failure
        await db.orders.delete_many({"id": ORDER_ID})
        client.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
