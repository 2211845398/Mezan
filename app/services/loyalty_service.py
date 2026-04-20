"""Loyalty points engine service (Epic 6.1).

Append-only ledger: balances are always derived by reading the last entry.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.customer_profile import CustomerProfile
from app.models.loyalty import LedgerEntryType, LedgerReasonCode, LoyaltyAccrualRule, LoyaltyLedger
from app.services.loyalty_gl_service import post_loyalty_ledger_gl


async def get_accrual_rule(db: AsyncSession, rule_id: int) -> LoyaltyAccrualRule:
    result = await db.execute(select(LoyaltyAccrualRule).where(LoyaltyAccrualRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise NotFoundError("Accrual rule not found", details={"rule_id": rule_id})
    return rule


async def list_accrual_rules(db: AsyncSession) -> list[LoyaltyAccrualRule]:
    result = await db.execute(select(LoyaltyAccrualRule).order_by(LoyaltyAccrualRule.id.desc()))
    return list(result.scalars().all())


async def create_accrual_rule(
    db: AsyncSession, *, data: dict[str, Any], created_by_user_id: int | None = None
) -> LoyaltyAccrualRule:
    rule = LoyaltyAccrualRule(**data, created_by_user_id=created_by_user_id)
    db.add(rule)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Accrual rule conflicts", details={"error": str(e.orig)}) from e
    await db.refresh(rule)
    return rule


async def update_accrual_rule(
    db: AsyncSession, *, rule_id: int, data: dict[str, Any]
) -> LoyaltyAccrualRule:
    rule = await get_accrual_rule(db, rule_id)
    for k, v in data.items():
        setattr(rule, k, v)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Accrual rule update conflicts") from e
    await db.refresh(rule)
    return rule


async def _ensure_customer_exists(db: AsyncSession, customer_id: int) -> None:
    result = await db.execute(select(CustomerProfile.id).where(CustomerProfile.id == customer_id))
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Customer not found", details={"customer_id": customer_id})


async def get_customer_balance(db: AsyncSession, customer_id: int) -> int:
    """Return current point balance from the most recent ledger entry."""
    await _ensure_customer_exists(db, customer_id)
    result = await db.execute(
        select(LoyaltyLedger.balance_after)
        .where(LoyaltyLedger.customer_id == customer_id)
        .order_by(LoyaltyLedger.id.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row if row is not None else 0


async def get_customer_ledger(
    db: AsyncSession, customer_id: int, *, limit: int = 50, offset: int = 0
) -> list[LoyaltyLedger]:
    await _ensure_customer_exists(db, customer_id)
    result = await db.execute(
        select(LoyaltyLedger)
        .where(LoyaltyLedger.customer_id == customer_id)
        .order_by(LoyaltyLedger.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def adjust_points(
    db: AsyncSession,
    *,
    customer_id: int,
    points: int,
    entry_type: LedgerEntryType,
    reason_code: LedgerReasonCode,
    auditor_id: int,
    note: str | None = None,
    reference_id: str | None = None,
    rule_id: int | None = None,
) -> LoyaltyLedger:
    """Append a credit or debit entry to the ledger.

    Computes balance_after from the current balance. Raises ValidationError
    if a debit would drive the balance negative.
    """
    current_balance = await get_customer_balance(db, customer_id)

    if entry_type == LedgerEntryType.CREDIT:
        balance_after = current_balance + points
    else:
        if points > current_balance:
            raise ValidationError(
                "Insufficient loyalty points",
                details={
                    "current_balance": current_balance,
                    "requested_debit": points,
                },
            )
        balance_after = current_balance - points

    entry = LoyaltyLedger(
        customer_id=customer_id,
        entry_type=entry_type,
        points=points,
        balance_after=balance_after,
        reason_code=reason_code,
        reference_id=reference_id,
        note=note,
        auditor_id=auditor_id,
        rule_id=rule_id,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    await post_loyalty_ledger_gl(db, entry)
    return entry
