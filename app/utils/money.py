"""Shared helpers for monetary rounding."""

from decimal import Decimal, ROUND_HALF_UP

MONEY = Decimal("0.01")


def q2(value: Decimal | float | int | str) -> Decimal:
    """Normalize a monetary amount to two decimal places."""
    return Decimal(str(value)).quantize(MONEY, rounding=ROUND_HALF_UP)
