"""Read-only inventory reporting: stock on hand (W-5.3)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.schemas.inventory_stock import StockOnHandRowRead
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
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[StockOnHandRowRead]:
    """List stock levels with WAVG unit cost (display-only) per branch/product."""
    return await list_stock_on_hand(
        db,
        branch_id=branch_id,
        category_id=category_id,
        q=q,
        limit=min(max(limit, 1), 500),
        offset=max(offset, 0),
    )
