"""Manual stock adjustment APIs (Epic 2 gap) + structured inventory movements."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.inventory_adjustments import StockAdjustmentRequest
from app.schemas.inventory_human_movement import (
    HumanInventoryMovementCreate,
    HumanInventoryMovementResponse,
)
from app.services import audit_service
from app.services.branch_scope import require_branch_open_for_operations
from app.services.inventory_adjustment_service import post_stock_movement_gl
from app.services.inventory_human_movement_service import apply_human_inventory_movement
from app.services.inventory_reporting_service import list_stock_movements_with_names
from app.services.inventory_service import apply_stock_movement

router = APIRouter()


@router.post("/inventory/adjustments")
async def create_stock_adjustment(
    body: StockAdjustmentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("stock_adjustments", "create"),
) -> dict:
    await require_branch_open_for_operations(db, body.branch_id)
    mv = await apply_stock_movement(
        db,
        idempotency_key=body.idempotency_key,
        branch_id=body.branch_id,
        product_id=body.product_id,
        qty_delta=body.qty_delta,
        reason=body.reason,
        ref_type="manual_adjustment",
        ref_id=str(current_user.id),
        variant_id=body.variant_id,
    )

    # Post GL for the adjustment (Epic 19.6)
    gl_result = await post_stock_movement_gl(db, movement=mv)

    await audit_service.log(
        session=db,
        action="stock.adjusted",
        resource_type="stock_movement",
        resource_id=str(mv.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return {"movement_id": mv.id, "gl_posting": gl_result}


@router.post("/inventory/movements", response_model=HumanInventoryMovementResponse)
async def create_human_inventory_movement(
    body: HumanInventoryMovementCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("stock_adjustments", "create"),
) -> HumanInventoryMovementResponse:
    await require_branch_open_for_operations(db, body.branch_id)
    mv = await apply_human_inventory_movement(
        db,
        user_id=current_user.id,
        idempotency_key=body.idempotency_key,
        branch_id=body.branch_id,
        product_id=body.product_id,
        variant_id=body.variant_id,
        uom_id=body.uom_id,
        transaction_type=body.transaction_type,
        quantity=body.quantity,
        qty_signed=body.qty_signed,
        reserve_movement_id=body.reserve_movement_id,
        notes=body.notes,
        reason=body.reason,
        unit_cost=body.unit_cost,
    )
    await audit_service.log(
        session=db,
        action="inventory.movement.human",
        resource_type="stock_movement",
        resource_id=str(mv.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return HumanInventoryMovementResponse(movement_id=mv.id)


@router.get("/inventory/movements")
async def list_stock_movements(
    branch_id: int | None = None,
    product_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("stock_adjustments", "read"),
) -> list[dict]:
    return await list_stock_movements_with_names(
        db,
        branch_id=branch_id,
        product_id=product_id,
        limit=limit,
        offset=offset,
    )
