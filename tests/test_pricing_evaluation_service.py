"""Unit tests for pricing evaluation helpers."""

from decimal import Decimal

from app.services.pricing_evaluation_service import (
    DEFAULT_MARKUP_PCT,
    compute_implied_markup_pct,
    compute_suggested_price,
    row_needs_pricing_review,
)


def test_compute_suggested_price_default_markup():
    assert compute_suggested_price(Decimal("100")) == Decimal("130.00")


def test_compute_suggested_price_custom_markup():
    assert compute_suggested_price(Decimal("80"), Decimal("25")) == Decimal("100.00")


def test_compute_implied_markup_pct():
    assert compute_implied_markup_pct(Decimal("100"), Decimal("130")) == Decimal("30.00")


def test_row_needs_pricing_review_no_sell_price():
    assert row_needs_pricing_review(
        valuation_cost=Decimal("50"),
        has_sell=False,
        current_sell=None,
    )


def test_row_needs_pricing_review_margin_drift():
    assert row_needs_pricing_review(
        valuation_cost=Decimal("100"),
        has_sell=True,
        current_sell=Decimal("120"),
    )


def test_row_needs_pricing_review_at_target():
    suggested = compute_suggested_price(Decimal("100"), DEFAULT_MARKUP_PCT)
    assert suggested is not None
    assert not row_needs_pricing_review(
        valuation_cost=Decimal("100"),
        has_sell=True,
        current_sell=suggested,
    )
