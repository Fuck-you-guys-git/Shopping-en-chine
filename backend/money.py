"""Currencies. Catalog prices are in F CFA (XOF); € and $ are derived from them."""
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

Currency = Literal["XOF", "EUR", "USD"]

# F CFA per unit of each currency.
XOF_RATES: dict[str, Decimal] = {
    "XOF": Decimal("1"),
    "EUR": Decimal("655.957"),  # fixed by law (CFA franc peg to the euro)
    "USD": Decimal("600"),      # chosen by the shop owner: edit here to change the dollar rate
}


def to_minor_units(amount_xof: int, currency: str) -> int:
    """Amount in Paxity minor units: F CFA x 100 (confirmed by the shop owner), € and $ in cents."""
    amount = Decimal(amount_xof) / XOF_RATES[currency]
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
