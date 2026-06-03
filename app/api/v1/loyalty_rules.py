"""Loyalty Rules API (Epic 22.3).

Hardcoded rule evaluator for stability per user decision.
Rules are implemented in code, not dynamic JSONB.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.loyalty_rules import (
    LoyaltyCalculationRead,
    LoyaltyCalculationRequest,
    LoyaltyPreviewResponse,
    LoyaltyRuleRead,
    LoyaltyRulesListResponse,
    MatchedRuleRead,
)
from app.services.loyalty_dsl_service import (
    calculate_loyalty_for_purchase,
    evaluate_rules,
    get_all_rules,
)

router = APIRouter()


@router.get(
    "/crm/loyalty/rules",
    response_model=LoyaltyRulesListResponse,
)
async def list_loyalty_rules_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("loyalty", "read"),
) -> LoyaltyRulesListResponse:
    """Get all configured loyalty rules.

    Returns the hardcoded rules that drive loyalty accrual.
    """
    rules = get_all_rules()
    return LoyaltyRulesListResponse(rules=[LoyaltyRuleRead(**r) for r in rules])


@router.post(
    "/crm/loyalty/calculate",
    response_model=LoyaltyCalculationRead,
)
async def calculate_loyalty_endpoint(
    body: LoyaltyCalculationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("loyalty", "read"),
) -> LoyaltyCalculationRead:
    """Preview loyalty points for a purchase without recording.

    Evaluates all rules against the provided context and returns
    the breakdown of matched rules and total points.
    """
    context = {
        "cart_total": body.cart_total,
        "category_code": body.category_codes[0] if body.category_codes else None,
        "is_weekend": body.is_weekend,
    }

    result = evaluate_rules(context)

    return LoyaltyCalculationRead(
        matched_rules=[MatchedRuleRead(**r) for r in result["matched_rules"]],
        calculation=result["calculation"],
        base_points=result["calculation"]["base_points"],
        multiplier=result["calculation"]["multiplier"],
        total_points=result["calculation"]["total_points"],
    )


@router.get(
    "/crm/loyalty/preview/{cart_total}",
    response_model=LoyaltyPreviewResponse,
)
async def preview_loyalty_for_cart(
    cart_total: float,
    category_code: str | None = Query(None),
    is_weekend: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("loyalty", "read"),
) -> LoyaltyPreviewResponse:
    """Quick preview of loyalty for a given cart total.

    Convenience endpoint for POS UI to show expected points before checkout.
    """
    from decimal import Decimal

    result = calculate_loyalty_for_purchase(
        cart_total=Decimal(str(cart_total)),
        category_codes=[category_code] if category_code else [],
        is_weekend=is_weekend,
    )

    return LoyaltyPreviewResponse(
        cart_total=Decimal(str(cart_total)),
        would_earn=result["calculation"]["total_points"],
        breakdown=result["calculation"],
    )
