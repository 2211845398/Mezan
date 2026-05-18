"""POS rules: only active customers may be attached for checkout / receivables paths."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.customer_profile import CustomerAccountStatus, CustomerProfile


async def assert_customer_active_for_pos(db: AsyncSession, customer_id: int | None) -> None:
    """Raise if ``customer_id`` is set and the profile is missing or not active."""
    if customer_id is None:
        return
    res = await db.execute(select(CustomerProfile).where(CustomerProfile.id == customer_id))
    c = res.scalar_one_or_none()
    if not c:
        raise NotFoundError("Customer not found", details={"customer_id": customer_id})
    if c.account_status != CustomerAccountStatus.ACTIVE:
        raise ValidationError(
            "Customer account is not active for POS",
            details={"customer_id": customer_id, "code": "customer_inactive_pos"},
        )
