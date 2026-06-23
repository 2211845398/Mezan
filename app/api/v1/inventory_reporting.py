"""Read-only inventory reporting: stock on hand (W-5.3 + operations redesign)."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_any_permission, require_permission
from app.db.database import get_db
from app.models.branch import Branch
from app.models.users import User
from app.schemas.inventory_reorder import (
    CommercialRestockAlertRow,
    CreatePurchaseOrdersFromReorderRequest,
    CreatePurchaseOrdersFromReorderResponse,
    ReorderAlertCountRead,
    ReorderAlertRow,
)
from app.schemas.inventory_stock import (
    StockCardRead,
    StockFinderBranchBrief,
    StockFinderResultRead,
    StockOnHandRowRead,
)
from app.services.inventory_stock_card_service import get_product_stock_card
from app.schemas.pagination import clamp_pagination
from app.services import audit_service
from app.services.inventory_reorder_service import (
    count_commercial_restock_alerts,
    count_reorder_alerts,
    create_purchase_orders_from_reorder,
    list_commercial_restock_alerts,
    list_reorder_alerts,
)
from app.services.inventory_reporting_service import (
    STOCK_FINDER_MAX_RESULTS,
    STOCK_ON_HAND_MAX_LIMIT,
    list_stock_finder_branches,
    list_stock_on_hand,
    stock_finder,
)

router = APIRouter()


@router.get(
    "/inventory/stock-on-hand",
    response_model=list[StockOnHandRowRead],
)
async def list_stock_on_hand_endpoint(
    branch_id: int | None = None,
    branch_kind: str | None = None,
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
        branch_kind=branch_kind,
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
    "/inventory/stock-finder/branches",
    response_model=list[StockFinderBranchBrief],
)
async def stock_finder_branches_endpoint(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[StockFinderBranchBrief]:
    """Active branches for mobile stock lookup branch picker."""
    return await list_stock_finder_branches(db)


@router.get(
    "/inventory/stock-finder",
    response_model=list[StockFinderResultRead],
)
async def stock_finder_endpoint(
    q: str = Query(..., min_length=1, max_length=120),
    branch_id: int | None = None,
    limit: int = Query(STOCK_FINDER_MAX_RESULTS, ge=1, le=STOCK_FINDER_MAX_RESULTS),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "read"),
) -> list[StockFinderResultRead]:
    """Mobile-friendly grouped stock lookup (floor staff)."""
    current_branch_id = branch_id if branch_id is not None else current_user.branch_id
    branch_name: str | None = None
    if current_branch_id is not None:
        branch = await db.get(Branch, current_branch_id)
        branch_name = branch.name if branch else None
    return await stock_finder(
        db,
        q=q,
        current_branch_id=current_branch_id,
        current_branch_name=branch_name,
        limit=limit,
    )


@router.get(
    "/inventory/products/{product_id}/stock-card",
    response_model=StockCardRead,
)
async def get_product_stock_card_endpoint(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> StockCardRead:
    return await get_product_stock_card(db, product_id=product_id)


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


@router.get(
    "/inventory/reorder-alerts/count",
    response_model=ReorderAlertCountRead,
)
async def count_reorder_alerts_endpoint(
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_any_permission(
        ("inventory", "read"),
        ("purchase_orders", "read"),
    ),
) -> ReorderAlertCountRead:
    return ReorderAlertCountRead(count=await count_reorder_alerts(db, branch_id=branch_id))


@router.get(
    "/inventory/commercial-restock-alerts",
    response_model=list[CommercialRestockAlertRow],
)
async def list_commercial_restock_alerts_endpoint(
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[CommercialRestockAlertRow]:
    return await list_commercial_restock_alerts(db, branch_id=branch_id)


@router.get(
    "/inventory/commercial-restock-alerts/count",
    response_model=ReorderAlertCountRead,
)
async def count_commercial_restock_alerts_endpoint(
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> ReorderAlertCountRead:
    return ReorderAlertCountRead(
        count=await count_commercial_restock_alerts(db, branch_id=branch_id),
    )


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
