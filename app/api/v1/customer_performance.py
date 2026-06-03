"""Customer Performance API (Epic 22.1)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.customer_performance import (
    CustomerPerformanceListRequest,
    CustomerPerformanceListResponse,
    CustomerPerformanceRead,
    CustomerSummaryRead,
)
from app.services.customer_performance_service import (
    get_customer_performance,
    list_customer_performance_summary,
)

router = APIRouter()


@router.get(
    "/crm/customers/{customer_id}/performance",
    response_model=CustomerPerformanceRead,
)
async def get_customer_performance_endpoint(
    customer_id: int,
    days_back: int = Query(default=365, ge=30, le=1825),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("customers", "read"),
) -> CustomerPerformanceRead:
    """Get comprehensive performance metrics for a single customer.

    Includes AOV, LTV, visit patterns, loyalty balance, and top products.
    """
    result = await get_customer_performance(
        db,
        customer_id=customer_id,
        days_back=days_back,
    )
    return CustomerPerformanceRead(**result)


@router.post(
    "/crm/customers/performance-summary",
    response_model=CustomerPerformanceListResponse,
)
async def list_customer_performance_endpoint(
    body: CustomerPerformanceListRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("customers", "read"),
) -> CustomerPerformanceListResponse:
    """Get performance summary for multiple customers (CRM dashboard).

    Returns customers ranked by total spend with key metrics.
    """
    customers = await list_customer_performance_summary(
        db,
        branch_id=body.branch_id,
        limit=body.limit,
        offset=body.offset,
        min_spend=body.min_spend,
    )

    return CustomerPerformanceListResponse(
        customers=[CustomerSummaryRead(**c) for c in customers],
        total=len(customers),  # Should query total count separately in production
        limit=body.limit,
        offset=body.offset,
    )
