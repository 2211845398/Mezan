"""Cash payment rounding to a configured currency increment."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.utils.money import q2


def round_cash_total(
    exact: Decimal,
    increment: Decimal | None,
) -> tuple[Decimal, Decimal]:
    """Return ``(rounded_amount, rounding_difference)`` where difference is rounded - exact."""
    exact_q = q2(exact)
    if increment is None or increment <= Decimal("0"):
        return exact_q, Decimal("0.00")
    inc = increment
    units = (exact_q / inc).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    rounded = q2(units * inc)
    return rounded, q2(rounded - exact_q)
