"""Read-only inventory reporting: stock on hand (W-5.3 + operations redesign)."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.inventory_reorder import (
    CreatePurchaseOrdersFromReorderRequest,
    CreatePurchaseOrdersFromReorderResponse,
    ReorderAlertRow,
)
from app.schemas.inventory_stock import StockOnHandRowRead
from app.schemas.pagination import clamp_pagination
from app.services import audit_service
from app.services.inventory_reorder_service import (
    create_purchase_orders_from_reorder,
    list_reorder_alerts,
)
from app.services.inventory_reporting_service import STOCK_ON_HAND_MAX_LIMIT, list_stock_on_hand

router = APIRouter()


@router.get(
    "/inventory/stock-on-hand",
    response_model=list[StockOnHandRowRead],
)
async def list_stock_on_hand_endpoint(
    branch_id: int | None = None,
    category_id: int | None = None,
    variant_id: int | None = None,
    q: str | None = None,
    reorder_only: bool = False,
    status: str | None = None,
    sort: str | None = None,
    limit: int = Query(50, ge=1, le=STOCK_ON_HAND_MAX_LIMIT),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[StockOnHandRowRead]:
    """List stock levels with WAVG unit cost (display-only) per branch/product."""
    limit, offset = clamp_pagination(limit, offset, max_limit=STOCK_ON_HAND_MAX_LIMIT)
    return await list_stock_on_hand(
        db,
        branch_id=branch_id,
        category_id=category_id,
        variant_id=variant_id,
        q=q,
        reorder_only=reorder_only,
        status=status,
        limit=limit,
        offset=offset,
        sort=sort,
    )


@router.get(
    "/inventory/reorder-alerts",
    response_model=list[ReorderAlertRow],
)
async def list_reorder_alerts_endpoint(
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[ReorderAlertRow]:
    return await list_reorder_alerts(db, branch_id=branch_id)


@router.post(
    "/inventory/reorder-alerts/create-purchase-order",
    response_model=CreatePurchaseOrdersFromReorderResponse,
)
async def create_purchase_orders_from_reorder_endpoint(
    body: CreatePurchaseOrdersFromReorderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "create"),
) -> CreatePurchaseOrdersFromReorderResponse:
    result = await create_purchase_orders_from_reorder(
        db,
        user_id=current_user.id,
        body=body,
    )
    if result.created:
        await audit_service.log(
            session=db,
            action="inventory.reorder.create_purchase_orders",
            resource_type="purchase_order",
            resource_id=",".join(str(r.purchase_order_id) for r in result.created),
            user_id=current_user.id,
            request=request,
        )
    return result
