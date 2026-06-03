"""Discount Rule API (Epic 6.2): CRUD and validation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.discount import (
    DiscountRuleCreate,
    DiscountRuleListResponse,
    DiscountRuleRead,
    DiscountRuleUpdate,
)
from app.services import audit_service
from app.services.discount_service import (
    create_discount_rule,
    delete_discount_rule,
    get_discount_rule,
    list_discount_rules,
    update_discount_rule,
    validate_discount,
)

router = APIRouter()


@router.post(
    "/discounts",
    response_model=DiscountRuleRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_discount_rule_endpoint(
    body: DiscountRuleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("discounts", "create"),
) -> DiscountRuleRead:
    rule = await create_discount_rule(
        db, data=body.model_dump(), created_by_user_id=current_user.id
    )
    await audit_service.log(
        session=db,
        action="discount_rule.created",
        resource_type="discount_rule",
        resource_id=str(rule.id),
        new_value=DiscountRuleRead.model_validate(rule).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return DiscountRuleRead.model_validate(rule)


@router.get("/discounts", response_model=DiscountRuleListResponse)
async def list_discount_rules_endpoint(
    status_filter: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("discounts", "read"),
) -> DiscountRuleListResponse:
    rules, total = await list_discount_rules(db, status=status_filter, limit=limit, offset=offset)
    items = [DiscountRuleRead.model_validate(r) for r in rules]
    return DiscountRuleListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/discounts/{rule_id}", response_model=DiscountRuleRead)
async def get_discount_rule_endpoint(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("discounts", "read"),
) -> DiscountRuleRead:
    rule = await get_discount_rule(db, rule_id)
    return DiscountRuleRead.model_validate(rule)


@router.patch("/discounts/{rule_id}", response_model=DiscountRuleRead)
async def update_discount_rule_endpoint(
    rule_id: int,
    body: DiscountRuleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("discounts", "update"),
) -> DiscountRuleRead:
    rule = await update_discount_rule(db, rule_id=rule_id, data=body.model_dump(exclude_unset=True))
    await audit_service.log(
        session=db,
        action="discount_rule.updated",
        resource_type="discount_rule",
        resource_id=str(rule.id),
        new_value=DiscountRuleRead.model_validate(rule).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return DiscountRuleRead.model_validate(rule)


@router.delete("/discounts/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discount_rule_endpoint(
    rule_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("discounts", "delete"),
) -> None:
    await delete_discount_rule(db, rule_id=rule_id)
    await audit_service.log(
        session=db,
        action="discount_rule.deleted",
        resource_type="discount_rule",
        resource_id=str(rule_id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


@router.post(
    "/discounts/{rule_id}/validate",
    response_model=DiscountRuleRead,
)
async def validate_discount_endpoint(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("discounts", "read"),
) -> DiscountRuleRead:
    rule = await validate_discount(db, rule_id=rule_id)
    return DiscountRuleRead.model_validate(rule)
