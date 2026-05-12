"""Production Orders API (Epic 20.3)."""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.production_orders import (
    BillOfMaterialsDetailRead,
    BillOfMaterialsRead,
    BomCostCalculationRead,
    BomCostCalculationRequest,
    BomCreateRequest,
    BomLineCreateRequest,
    ProductionOrderCreateRequest,
    ProductionOrderIssueRead,
    ProductionOrderRead,
    ProductionOrderReceiptRead,
)
from app.services import audit_service
from app.services.production_order_service import (
    calculate_bom_cost,
    create_production_order,
    issue_materials,
    receive_finished_goods,
)

router = APIRouter()


@router.post(
    "/production/orders",
    response_model=ProductionOrderRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_production_order_endpoint(
    body: ProductionOrderCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("production_orders", "create"),
) -> ProductionOrderRead:
    """Create a new production order in draft status."""
    order = await create_production_order(
        db,
        bom_id=body.bom_id,
        branch_id=body.branch_id,
        qty_to_produce=body.qty_to_produce,
        planned_start=body.planned_start,
        planned_end=body.planned_end,
        notes=body.notes,
        user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="production_order.created",
        resource_type="production_order",
        resource_id=str(order.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ProductionOrderRead.model_validate(order)


@router.post(
    "/production/orders/{order_id}/issue",
    response_model=ProductionOrderRead,
)
async def issue_materials_endpoint(
    order_id: int,
    request: Request,
    idempotency_key: str = Query(..., description="Idempotency key for this operation"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("production_orders", "update"),
) -> ProductionOrderRead:
    """Issue materials to a production order: Dr WIP, Cr Inventory."""
    order = await issue_materials(
        db,
        production_order_id=order_id,
        idempotency_key=idempotency_key,
        user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="production_order.materials_issued",
        resource_type="production_order",
        resource_id=str(order.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ProductionOrderRead.model_validate(order)


@router.post(
    "/production/orders/{order_id}/complete",
    response_model=ProductionOrderRead,
)
async def complete_production_order_endpoint(
    order_id: int,
    request: Request,
    idempotency_key: str = Query(..., description="Idempotency key for this operation"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("production_orders", "update"),
) -> ProductionOrderRead:
    """Complete a production order and receive finished goods: Dr Finished, Cr WIP."""
    order = await receive_finished_goods(
        db,
        production_order_id=order_id,
        idempotency_key=idempotency_key,
        user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="production_order.completed",
        resource_type="production_order",
        resource_id=str(order.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ProductionOrderRead.model_validate(order)


@router.post(
    "/production/boms/calculate-cost",
    response_model=BomCostCalculationRead,
)
async def calculate_bom_cost_endpoint(
    body: BomCostCalculationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("production_orders", "read"),
) -> BomCostCalculationRead:
    """Calculate the total cost to produce using a BoM."""
    result = await calculate_bom_cost(
        db,
        bom_id=body.bom_id,
        branch_id=body.branch_id,
        qty=body.qty,
    )
    return BomCostCalculationRead(**result)
