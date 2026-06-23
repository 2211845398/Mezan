"""Inventory reorder policy APIs (per branch + product)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.inventory_policy import InventoryPolicyRead, InventoryPolicyUpsert
from app.services import audit_service
from app.services.inventory_policy_service import (
    default_policy_read,
    get_policy,
    policy_to_read,
    upsert_policy,
)

router = APIRouter()


@router.get(
    "/inventory/policies/{branch_id}/{product_id}",
    response_model=InventoryPolicyRead,
)
async def get_inventory_policy_endpoint(
    branch_id: int,
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> InventoryPolicyRead:
    row = await get_policy(db, branch_id=branch_id, product_id=product_id)
    if not row:
        return default_policy_read(branch_id=branch_id, product_id=product_id)
    return policy_to_read(row)


@router.patch(
    "/inventory/policies/{branch_id}/{product_id}",
    response_model=InventoryPolicyRead,
)
async def patch_inventory_policy_endpoint(
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
        action="inventory.policy.upsert",
        resource_type="inventory_policy",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(row)
    return policy_to_read(row)
