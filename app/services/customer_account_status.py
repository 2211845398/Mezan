"""Helpers for ``CustomerProfile.account_status`` and ``is_active`` sync."""

from __future__ import annotations

from app.core.errors import ValidationError
from app.models.customer_profile import CustomerAccountStatus, CustomerProfile


def sync_is_active_from_account_status(customer: CustomerProfile) -> None:
    """``is_active`` mirrors POS eligibility: only ``active`` is true."""
    customer.is_active = customer.account_status == CustomerAccountStatus.ACTIVE


def parse_account_status(value: str) -> CustomerAccountStatus:
    try:
        return CustomerAccountStatus(value)
    except ValueError as exc:
        raise ValidationError(
            "Invalid account_status",
            details={"allowed": [s.value for s in CustomerAccountStatus]},
        ) from exc
