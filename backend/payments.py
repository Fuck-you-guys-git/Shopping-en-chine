"""Payment configuration for the checkout, and the Paxity widget result."""
from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from money import XOF_RATES
from orders import OrderSummary
from settings import paxity_org_id

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/config")
async def payment_config():
    org_id = paxity_org_id()
    return {
        "currencies": {code: float(rate) for code, rate in XOF_RATES.items()},
        "paxity": {"enabled": bool(org_id), "org_id": org_id or None},
    }


@router.post("/paxity/{order_id}/reported", response_model=OrderSummary)
async def paxity_payment_reported(order_id: str, db=Depends(get_db)):
    """The widget's onSuccess fired in the customer's browser.

    That alone proves nothing (it can be faked), so the order only moves to
    "paiement à vérifier": check it in the Paxity dashboard before shipping.
    """
    await db.orders.update_one(
        {
            "id": order_id,
            "payment_method": {"$in": ["mobile_money", "carte"]},
            "status": "en attente de paiement",
        },
        {"$set": {"status": "paiement à vérifier"}},
    )
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order
