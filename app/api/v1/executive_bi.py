"""Executive BI aggregation API (Epic 5.6)."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.accounting import CategoryRevenueBreakdownRead, ExecutiveKpiRead
from app.services.executive_bi_service import category_revenue_breakdown, executive_sales_kpis

router = APIRouter()


@router.get("/bi/executive-kpis", response_model=ExecutiveKpiRead)
async def executive_kpis_endpoint(
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> ExecutiveKpiRead:
    data = await executive_sales_kpis(
        db,
        period_start=period_start,
        period_end=period_end,
        branch_id=branch_id,
    )
    return ExecutiveKpiRead.model_validate(data)


@router.get(
    "/bi/categories/{category_id}/revenue",
    response_model=CategoryRevenueBreakdownRead,
)
async def category_revenue_endpoint(
    category_id: int,
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> CategoryRevenueBreakdownRead:
    data = await category_revenue_breakdown(
        db,
        category_id,
        period_start=period_start,
        period_end=period_end,
        branch_id=branch_id,
    )
    return CategoryRevenueBreakdownRead.model_validate(data)
