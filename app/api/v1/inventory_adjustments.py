"""Manual stock adjustment APIs (Epic 2 gap)."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.stock_movement import StockMovement
from app.models.users import User
from app.schemas.epic3 import StockAdjustmentRequest
from app.services import audit_service
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
    mv = await apply_stock_movement(
        db,
        idempotency_key=body.idempotency_key,
        branch_id=body.branch_id,
        product_id=body.product_id,
        qty_delta=body.qty_delta,
        reason=body.reason,
        ref_type="manual_adjustment",
        ref_id=str(current_user.id),
    )
    await audit_service.log(
        session=db,
        action="stock.adjusted",
        resource_type="stock_movement",
        resource_id=str(mv.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return {"movement_id": mv.id}


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
    q = select(StockMovement).order_by(StockMovement.id.desc()).limit(limit).offset(offset)
    if branch_id is not None:
        q = q.where(StockMovement.branch_id == branch_id)
    if product_id is not None:
        q = q.where(StockMovement.product_id == product_id)
    res = await db.execute(q)
    rows = res.scalars().all()
    return [
        {
            "id": r.id,
            "branch_id": r.branch_id,
            "product_id": r.product_id,
            "qty_delta": r.qty_delta,
            "reason": r.reason,
            "ref_type": r.ref_type,
            "ref_id": r.ref_id,
            "created_at": r.created_at,
        }
        for r in rows
    ]
