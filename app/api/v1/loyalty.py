"""Loyalty Points API (Epic 6.1): accrual rules, balance, ledger, adjustments."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.loyalty import (
    AccrualRuleCreate,
    AccrualRuleRead,
    AccrualRuleUpdate,
    LedgerEntryRead,
    LoyaltyBalanceRead,
    ManualPointAdjustment,
)
from app.services import audit_service
from app.services.loyalty_service import (
    adjust_points,
    create_accrual_rule,
    get_accrual_rule,
    get_customer_balance,
    get_customer_ledger,
    list_accrual_rules,
    update_accrual_rule,
)

router = APIRouter()


# ── Accrual rules ──────────────────────────────────────────────────────────


@router.post(
    "/loyalty/rules",
    response_model=AccrualRuleRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_accrual_rule_endpoint(
    body: AccrualRuleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("loyalty", "create"),
) -> AccrualRuleRead:
    rule = await create_accrual_rule(
        db, data=body.model_dump(), created_by_user_id=current_user.id
    )
    await audit_service.log(
        session=db,
        action="loyalty_rule.created",
        resource_type="loyalty_accrual_rule",
        resource_id=str(rule.id),
        new_value=AccrualRuleRead.model_validate(rule).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return AccrualRuleRead.model_validate(rule)


@router.get("/loyalty/rules", response_model=list[AccrualRuleRead])
async def list_accrual_rules_endpoint(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("loyalty", "read"),
) -> list[AccrualRuleRead]:
    rules = await list_accrual_rules(db)
    return [AccrualRuleRead.model_validate(r) for r in rules]


@router.get("/loyalty/rules/{rule_id}", response_model=AccrualRuleRead)
async def get_accrual_rule_endpoint(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("loyalty", "read"),
) -> AccrualRuleRead:
    rule = await get_accrual_rule(db, rule_id)
    return AccrualRuleRead.model_validate(rule)


@router.patch("/loyalty/rules/{rule_id}", response_model=AccrualRuleRead)
async def update_accrual_rule_endpoint(
    rule_id: int,
    body: AccrualRuleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("loyalty", "update"),
) -> AccrualRuleRead:
    rule = await update_accrual_rule(
        db, rule_id=rule_id, data=body.model_dump(exclude_unset=True)
    )
    await audit_service.log(
        session=db,
        action="loyalty_rule.updated",
        resource_type="loyalty_accrual_rule",
        resource_id=str(rule.id),
        new_value=AccrualRuleRead.model_validate(rule).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return AccrualRuleRead.model_validate(rule)


# ── Customer balance & ledger ──────────────────────────────────────────────


@router.get(
    "/loyalty/customers/{customer_id}/balance",
    response_model=LoyaltyBalanceRead,
)
async def get_balance_endpoint(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("loyalty", "read"),
) -> LoyaltyBalanceRead:
    balance = await get_customer_balance(db, customer_id)
    return LoyaltyBalanceRead(customer_id=customer_id, total_points=balance)


@router.get(
    "/loyalty/customers/{customer_id}/ledger",
    response_model=list[LedgerEntryRead],
)
async def get_ledger_endpoint(
    customer_id: int,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("loyalty", "read"),
) -> list[LedgerEntryRead]:
    entries = await get_customer_ledger(db, customer_id, limit=limit, offset=offset)
    return [LedgerEntryRead.model_validate(e) for e in entries]


# ── Manual adjustment ──────────────────────────────────────────────────────


@router.post(
    "/loyalty/adjustments",
    response_model=LedgerEntryRead,
    status_code=status.HTTP_201_CREATED,
)
async def manual_adjustment_endpoint(
    body: ManualPointAdjustment,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("loyalty", "adjust"),
) -> LedgerEntryRead:
    entry = await adjust_points(
        db,
        customer_id=body.customer_id,
        points=body.points,
        entry_type=body.entry_type,
        reason_code=body.reason_code,
        note=body.note,
        auditor_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="loyalty_ledger.manual_adjustment",
        resource_type="loyalty_ledger",
        resource_id=str(entry.id),
        new_value=LedgerEntryRead.model_validate(entry).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return LedgerEntryRead.model_validate(entry)
