"""Customer onboarding service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.customer_profile import CustomerOnboardingToken, CustomerProfile
from app.utils.security import hash_token


async def create_temporary_customer(
    db: AsyncSession, *, phone: str, created_by_user_id: int
) -> tuple[CustomerProfile, str]:
    customer = CustomerProfile(
        phone=phone,
        is_temporary=True,
        is_active=False,
        created_by_user_id=created_by_user_id,
    )
    db.add(customer)
    await db.flush()
    token = token_urlsafe(24)
    db.add(
        CustomerOnboardingToken(
            customer_id=customer.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(hours=12),
            used=False,
        )
    )
    await db.commit()
    await db.refresh(customer)
    return customer, token


async def complete_onboarding(
    db: AsyncSession,
    *,
    token: str,
    first_name: str | None,
    father_name: str | None,
    family_name: str | None,
    email: str | None,
) -> CustomerProfile:
    token_hash = hash_token(token)
    res = await db.execute(
        select(CustomerOnboardingToken).where(CustomerOnboardingToken.token_hash == token_hash)
    )
    rec = res.scalar_one_or_none()
    if not rec or rec.used or rec.expires_at <= datetime.now(UTC):
        raise ValidationError("Invalid or expired onboarding token")
    c_res = await db.execute(select(CustomerProfile).where(CustomerProfile.id == rec.customer_id))
    customer = c_res.scalar_one_or_none()
    if not customer:
        raise ValidationError("Customer not found")
    if first_name is not None:
        customer.first_name = first_name.strip() or None
    if father_name is not None:
        customer.father_name = father_name.strip() or None
    if family_name is not None:
        customer.family_name = family_name.strip() or None
    customer.email = email or customer.email
    customer.is_temporary = False
    rec.used = True
    await db.commit()
    await db.refresh(customer)
    return customer
