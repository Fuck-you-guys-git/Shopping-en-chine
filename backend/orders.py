"""Orders. Totals are computed here from catalog prices; the client only says what and how many."""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from database import get_db
from money import Currency, to_minor_units
from settings import paxity_org_id

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]

ShippingMethod = Literal["standard", "express", "relais"]
# livraison = cash on delivery; mobile_money (Wave, Orange Money) and carte go through Paxity.
PaymentMethod = Literal["livraison", "mobile_money", "carte"]

# Order lifecycle. Online orders start "en attente de paiement" and become
# "paiement à vérifier" when the widget reports success; the seller confirms them.
ORDER_STATUSES = (
    "en attente de paiement",
    "paiement à vérifier",
    "confirmée",
    "en préparation",
    "expédiée",
    "livrée",
    "annulée",
)

# Authoritative shipping table. frontend/src/lib/shipping.js mirrors it for display.
SHIPPING_METHODS = {
    "standard": {"fee": 3000, "free_from": 30000},
    "express": {"fee": 5000, "free_from": None},
    "relais": {"fee": 2000, "free_from": None},
}


def shipping_fee(method: str, subtotal: int) -> int:
    rule = SHIPPING_METHODS[method]
    if rule["free_from"] is not None and subtotal >= rule["free_from"]:
        return 0
    return rule["fee"]


class Customer(BaseModel):
    first_name: Text
    last_name: Text
    email: Text
    phone: Text
    address: Text
    zip: OptionalText = ""
    city: Text
    country: Literal["SN", "CI"]


class OrderLine(BaseModel):
    """An item as sent by the client: the product and a quantity. Any price sent is ignored."""
    product_id: Text
    qty: int = Field(ge=1, le=99)


class OrderCreate(BaseModel):
    customer: Customer
    items: list[OrderLine] = Field(min_length=1, max_length=50)
    shipping_method: ShippingMethod = "standard"
    payment_method: PaymentMethod = "livraison"
    payment_currency: Currency = "XOF"

    @model_validator(mode="after")
    def _currency_fits_method(self):
        # Wave / Orange Money and cash on delivery are in F CFA; card payments are in € or $.
        if self.payment_method == "carte" and self.payment_currency == "XOF":
            raise ValueError("Le paiement par carte se fait en euros ou en dollars.")
        if self.payment_method != "carte" and self.payment_currency != "XOF":
            raise ValueError("Wave, Orange Money et le paiement à la livraison se règlent en F CFA.")
        return self


class OrderItem(BaseModel):
    product_id: str
    name: str
    price: int
    qty: int


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field

    id: str = Field(default_factory=lambda: f"SEC-{uuid.uuid4().hex[:12].upper()}")
    customer: Customer
    items: list[OrderItem]
    subtotal: int
    shipping_method: ShippingMethod
    shipping: int
    total: int
    currency: str = "XOF"  # catalog prices and totals are in F CFA
    payment_method: PaymentMethod
    payment_currency: Currency = "XOF"
    amount_minor: Optional[int] = None  # amount Paxity charges, in payment_currency minor units
    status: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderSummary(BaseModel):
    """Public view of an order: no customer details."""
    model_config = ConfigDict(extra="ignore")

    id: str
    status: str
    total: int
    currency: str
    payment_method: PaymentMethod


router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=Order, status_code=201)
async def create_order(payload: OrderCreate, db=Depends(get_db)):
    online = payload.payment_method != "livraison"
    if online and not paxity_org_id():
        raise HTTPException(status_code=503, detail="Le paiement en ligne n'est pas encore disponible.")

    ids = sorted({line.product_id for line in payload.items})
    docs = await db.products.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "price": 1}
    ).to_list(len(ids))
    catalog = {doc["id"]: doc for doc in docs}
    missing = [pid for pid in ids if pid not in catalog]
    if missing:
        raise HTTPException(status_code=422, detail=f"Produit inconnu : {', '.join(missing)}")

    items = [
        OrderItem(
            product_id=line.product_id,
            name=catalog[line.product_id]["name"],
            price=catalog[line.product_id]["price"],
            qty=line.qty,
        )
        for line in payload.items
    ]
    subtotal = sum(item.price * item.qty for item in items)
    shipping = shipping_fee(payload.shipping_method, subtotal)
    total = subtotal + shipping
    order = Order(
        customer=payload.customer,
        items=items,
        subtotal=subtotal,
        shipping_method=payload.shipping_method,
        shipping=shipping,
        total=total,
        payment_method=payload.payment_method,
        payment_currency=payload.payment_currency,
        amount_minor=to_minor_units(total, payload.payment_currency) if online else None,
        # Cash on delivery is final once the customer confirms; an online
        # payment stays pending until the payment is verified.
        status="en attente de paiement" if online else "confirmée",
    )
    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.orders.insert_one(doc)
    return order


@router.get("/{order_id}", response_model=OrderSummary)
async def get_order(order_id: str, db=Depends(get_db)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order
