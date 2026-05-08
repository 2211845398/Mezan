"""Inventory operations redesign: pure helpers (no DB required)."""

from app.services.inventory_reporting_service import _reorder_status


def test_reorder_status_out_of_stock_before_below_reorder() -> None:
    assert _reorder_status(available=0, cover=100, reorder_point=5, policy_active=True) == "out_of_stock"


def test_reorder_status_below_reorder_uses_cover() -> None:
    assert _reorder_status(available=4, cover=4, reorder_point=5, policy_active=True) == "below_reorder"


def test_reorder_status_ok() -> None:
    assert _reorder_status(available=10, cover=10, reorder_point=5, policy_active=True) == "ok"


def test_reorder_status_no_policy() -> None:
    assert _reorder_status(available=1, cover=1, reorder_point=None, policy_active=False) == "none"
