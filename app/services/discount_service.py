"""Discount rule engine service (Epic 6.2).

CRUD, validation (dates, limits, stacking), and AI-draft creation.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.discount import DiscountRule, DiscountStatus
from app.schemas.ai_discount import AIAutoDiscountRequest


async def get_discount_rule_by_code(db: AsyncSession, *, code: str) -> DiscountRule:
    """Resolve a discount rule by its unique coupon ``code`` (trimmed, exact match)."""
    c = code.strip()
    if not c:
        raise ValidationError("Discount code is required")
    result = await db.execute(select(DiscountRule).where(DiscountRule.code == c))
    rule = result.scalar_one_or_none()
    if rule is None:
        raise NotFoundError("Unknown discount code", details={"code": c})
    return rule


async def get_discount_rule(db: AsyncSession, rule_id: int) -> DiscountRule:
    result = await db.execute(select(DiscountRule).where(DiscountRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise NotFoundError("Discount rule not found", details={"rule_id": rule_id})
    return rule


async def list_discount_rules(
    db: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[DiscountRule]:
    stmt = select(DiscountRule)
    if status is not None:
        stmt = stmt.where(DiscountRule.status == status)
    stmt = stmt.order_by(DiscountRule.id.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_discount_rule(
    db: AsyncSession, *, data: dict[str, Any], created_by_user_id: int | None = None
) -> DiscountRule:
    rule = DiscountRule(**data, created_by_user_id=created_by_user_id)
    db.add(rule)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError(
            "Discount rule conflicts with existing data", details={"error": str(e.orig)}
        ) from e
    await db.refresh(rule)
    return rule


async def update_discount_rule(
    db: AsyncSession, *, rule_id: int, data: dict[str, Any]
) -> DiscountRule:
    rule = await get_discount_rule(db, rule_id)
    for k, v in data.items():
        setattr(rule, k, v)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Discount rule update conflicts with existing data") from e
    await db.refresh(rule)
    return rule


async def delete_discount_rule(db: AsyncSession, *, rule_id: int) -> None:
    rule = await get_discount_rule(db, rule_id)
    if rule.status not in (DiscountStatus.DRAFT, DiscountStatus.DISABLED):
        raise ValidationError(
            "Only DRAFT or DISABLED rules can be deleted",
            details={"current_status": rule.status.value},
        )
    await db.delete(rule)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Cannot delete rule with existing references") from e


async def validate_discount(db: AsyncSession, *, rule_id: int) -> DiscountRule:
    """Check that a discount rule is currently valid for application.

    Validates: status, date window, usage limits, and stacking conflicts.
    """
    rule = await get_discount_rule(db, rule_id)

    if rule.status != DiscountStatus.ACTIVE:
        raise ValidationError(
            "Discount rule is not active",
            details={"status": rule.status.value},
        )

    now = datetime.now(UTC)
    start = (
        rule.start_date.replace(tzinfo=UTC) if rule.start_date.tzinfo is None else rule.start_date
    )
    if now < start:
        raise ValidationError(
            "Discount rule has not started yet",
            details={"start_date": str(rule.start_date)},
        )

    if rule.end_date is not None:
        end = rule.end_date.replace(tzinfo=UTC) if rule.end_date.tzinfo is None else rule.end_date
        if now > end:
            raise ValidationError(
                "Discount rule has expired",
                details={"end_date": str(rule.end_date)},
            )

    if rule.usage_limit is not None and rule.usage_count >= rule.usage_limit:
        raise ValidationError(
            "Discount rule usage limit reached",
            details={"usage_limit": rule.usage_limit, "usage_count": rule.usage_count},
        )

    if not rule.stackable:
        target_ids = rule.target_product_ids or []
        if target_ids:
            result = await db.execute(
                select(DiscountRule.id, DiscountRule.name).where(
                    and_(
                        DiscountRule.id != rule.id,
                        DiscountRule.status == DiscountStatus.ACTIVE,
                        DiscountRule.stackable.is_(False),
                        DiscountRule.target_product_ids.isnot(None),
                    )
                )
            )
            for other_id, other_name in result.all():
                other_rule = await get_discount_rule(db, other_id)
                other_targets = other_rule.target_product_ids or []
                overlap = set(target_ids) & set(other_targets)
                if overlap:
                    raise ValidationError(
                        "Non-stackable discount conflict",
                        details={
                            "conflicting_rule_id": other_id,
                            "conflicting_rule_name": other_name,
                            "overlapping_product_ids": sorted(overlap),
                        },
                    )

    return rule


async def create_ai_draft_discount(
    db: AsyncSession,
    *,
    payload: AIAutoDiscountRequest,
    created_by_user_id: int | None = None,
) -> DiscountRule:
    """Create a DRAFT DiscountRule from an AI-suggested payload."""
    code = f"AI-{uuid4().hex[:8].upper()}"
    rule = DiscountRule(
        name=f"AI Suggested - {payload.suggested_discount_type.value} {payload.percentage}%",
        code=code,
        discount_type=payload.suggested_discount_type,
        value=payload.percentage,
        target_product_ids=payload.target_product_ids,
        status=DiscountStatus.DRAFT,
        start_date=datetime.now(UTC),
        end_date=payload.expiration_date,
        stackable=False,
        created_by_user_id=created_by_user_id,
    )
    db.add(rule)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("AI draft discount conflicts", details={"error": str(e.orig)}) from e
    await db.refresh(rule)
    return rule
