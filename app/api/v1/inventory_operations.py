"""Inventory policies, reorder alerts, and product stock card (operations redesign)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.errors import NotFoundError
from app.db.database import get_db
from app.models.users import User
from app.schemas.inventory_policy import InventoryPolicyRead, InventoryPolicyUpsert
from app.schemas.inventory_reorder import (
    CreatePurchaseOrdersFromReorderRequest,
    CreatePurchaseOrdersFromReorderResponse,
    ReorderAlertRow,
)
from app.schemas.inventory_stock import StockCardRead
from app.services import audit_service
from app.services.inventory_policy_service import get_policy, upsert_policy
from app.services.inventory_reorder_service import (
    create_purchase_orders_from_reorder,
    list_reorder_alerts,
)
from app.services.inventory_stock_card_service import get_product_stock_card

router = APIRouter()


@router.get(
    "/inventory/policies/{branch_id}/{product_id}",
    response_model=InventoryPolicyRead,
)
async def get_inventory_policy(
    branch_id: int,
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> InventoryPolicyRead:
    row = await get_policy(db, branch_id=branch_id, product_id=product_id)
    if not row:
        raise NotFoundError("Policy not found", details={"branch_id": branch_id, "product_id": product_id})
    return InventoryPolicyRead.model_validate(row)


@router.patch(
    "/inventory/policies/{branch_id}/{product_id}",
    response_model=InventoryPolicyRead,
)
async def patch_inventory_policy(
    branch_id: int,
    product_id: int,
    body: InventoryPolicyUpsert,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> InventoryPolicyRead:
    row = await upsert_policy(
        db,
        branch_id=branch_id,
        product_id=product_id,
        reorder_point=body.reorder_point,
        reorder_qty=body.reorder_qty,
        preferred_supplier_id=body.preferred_supplier_id,
        lead_time_days=body.lead_time_days,
        is_active=body.is_active,
    )
    await audit_service.log(
        session=db,
        action="inventory.policy.upserted",
        resource_type="inventory_policy",
        resource_id=f"{branch_id}:{product_id}",
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return InventoryPolicyRead.model_validate(row)


@router.get("/inventory/reorder-alerts", response_model=list[ReorderAlertRow])
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
async def create_po_from_reorder_endpoint(
    body: CreatePurchaseOrdersFromReorderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "create"),
    __: None = require_permission("inventory", "read"),
) -> CreatePurchaseOrdersFromReorderResponse:
    res = await create_purchase_orders_from_reorder(db, user_id=current_user.id, body=body)
    await audit_service.log(
        session=db,
        action="inventory.reorder.create_po",
        resource_type="purchase_order",
        resource_id=",".join(str(c.purchase_order_id) for c in res.created) or "none",
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return res


@router.get("/inventory/products/{product_id}/stock-card", response_model=StockCardRead)
async def get_stock_card_endpoint(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> StockCardRead:
    return await get_product_stock_card(db, product_id=product_id)
