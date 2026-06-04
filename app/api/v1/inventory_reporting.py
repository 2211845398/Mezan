"""Read-only inventory reporting: stock on hand (W-5.3 + operations redesign)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.schemas.inventory_stock import StockOnHandRowRead
from app.schemas.pagination import clamp_pagination
from app.services.inventory_reporting_service import list_stock_on_hand

router = APIRouter()


@router.get(
    "/inventory/stock-on-hand",
    response_model=list[StockOnHandRowRead],
)
async def list_stock_on_hand_endpoint(
    branch_id: int | None = None,
    category_id: int | None = None,
    q: str | None = None,
    reorder_only: bool = False,
    status: str | None = None,
    sort: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[StockOnHandRowRead]:
    """List stock levels with WAVG unit cost (display-only) per branch/product."""
    limit, offset = clamp_pagination(limit, offset, max_limit=100)
    return await list_stock_on_hand(
        db,
        branch_id=branch_id,
        category_id=category_id,
        q=q,
        reorder_only=reorder_only,
        status=status,
        limit=limit,
        offset=offset,
        sort=sort,
    )
