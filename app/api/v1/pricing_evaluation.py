"""Pricing & inventory valuation evaluation API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_any_permission, require_any_role
from app.db.database import get_db
from app.models.users import User
from app.schemas.pricing_evaluation import (
    PricingCommitRequest,
    PricingCommitResponse,
    PricingEvaluationResponse,
    PurchaseHistoryLineRead,
)
from app.services import audit_service
from app.services.pricing_evaluation_service import (
    commit_product_sell_price,
    get_pricing_evaluation_matrix,
    list_purchase_history,
)

router = APIRouter()

_PRICING_ROLES = require_any_role("OWNER", "ADMIN", "ACCOUNTANT")


@router.get("/catalog/pricing/evaluate", response_model=PricingEvaluationResponse)
async def evaluate_pricing_matrix(
    branch_id: int | None = Query(None, gt=0),
    q: str | None = Query(None, max_length=128),
    needs_pricing_only: bool = Query(True),
    product_id: int | None = Query(None, gt=0),
    variant_id: int | None = Query(None, gt=0),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_any_permission(
        ("catalog", "read"),
        ("catalog", "update"),
        ("accounting", "read"),
        ("accounting", "update"),
    ),
    ___: None = _PRICING_ROLES,
) -> PricingEvaluationResponse:
    return await get_pricing_evaluation_matrix(
        db,
        branch_id=branch_id,
        q=q,
        needs_pricing_only=needs_pricing_only,
        product_id=product_id,
        variant_id=variant_id,
        limit=min(max(limit, 1), 200),
        offset=max(offset, 0),
    )


@router.post(
    "/catalog/pricing/commit",
    response_model=PricingCommitResponse,
    status_code=status.HTTP_200_OK,
)
async def commit_pricing_endpoint(
    body: PricingCommitRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(
        ("catalog", "update"),
        ("accounting", "update"),
    ),
    __: None = _PRICING_ROLES,
) -> PricingCommitResponse:
    result = await commit_product_sell_price(
        db,
        product_id=body.product_id,
        variant_id=body.variant_id,
        sell_price=body.sell_price,
    )
    await audit_service.log(
        session=db,
        action="product.sell_price_committed",
        resource_type="product",
        resource_id=str(body.product_id),
        new_value={
            "sell_price": str(result.sell_price),
            "currency_id": result.currency_id,
            "variant_id": result.variant_id,
        },
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return result


@router.get(
    "/catalog/pricing/purchase-history",
    response_model=list[PurchaseHistoryLineRead],
)
async def purchase_history_endpoint(
    branch_id: int = Query(..., gt=0),
    product_id: int = Query(..., gt=0),
    variant_id: int = Query(..., gt=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_any_permission(
        ("catalog", "read"),
        ("catalog", "update"),
        ("accounting", "read"),
        ("accounting", "update"),
    ),
    ___: None = _PRICING_ROLES,
) -> list[PurchaseHistoryLineRead]:
    return await list_purchase_history(
        db,
        branch_id=branch_id,
        product_id=product_id,
        variant_id=variant_id,
        limit=limit,
    )
