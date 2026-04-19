"""Shared helpers for monetary parsing and rounding."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

MONEY = Decimal("0.01")
MoneyInput = Decimal | float | int | str


def to_decimal(value: MoneyInput) -> Decimal:
    """Parse a money-like input without introducing float math."""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        raise ValueError("Boolean values are not valid monetary amounts")

    if isinstance(value, str):
        value = value.strip()
        if not value:
            raise ValueError("Empty strings are not valid monetary amounts")

    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"Invalid monetary amount: {value!r}") from exc


def q2(value: MoneyInput) -> Decimal:
    """Normalize a monetary amount to two decimal places."""
    return to_decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)
