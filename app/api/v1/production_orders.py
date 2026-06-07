"""Production Orders API (Epic 20.3)."""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.bom import BillOfMaterials
from app.models.branch import Branch
from app.models.product import Product
from app.models.users import User
from app.schemas.production_orders import (
    BillOfMaterialsDetailRead,
    BillOfMaterialsRead,
    BomCostCalculationRead,
    BomCostCalculationRequest,
    BomCreateRequest,
    BomLineCreateRequest,
    BomLineRead,
    BomPatchRequest,
    ProductionOrderCompleteRequest,
    ProductionOrderCreateRequest,
    ProductionOrderRead,
)
from app.services import audit_service
from app.services.bom_service import (
    add_bom_line,
    create_bom,
    delete_bom,
    get_bom,
    list_boms,
    update_bom,
)
from app.services.production_order_service import (
    calculate_bom_cost,
    create_production_order,
    get_production_order,
    issue_materials,
    list_production_orders,
    receive_finished_goods,
)

router = APIRouter()


async def _product_name_map(db: AsyncSession, product_ids: set[int]) -> dict[int, str]:
    if not product_ids:
        return {}
    res = await db.execute(select(Product).where(Product.id.in_(product_ids)))
    return {p.id: p.name for p in res.scalars().all()}


def _bom_to_read(bom: BillOfMaterials, names: dict[int, str]) -> BillOfMaterialsRead:
    return BillOfMaterialsRead(
        id=bom.id,
        name=bom.name,
        finished_product_id=bom.finished_product_id,
        finished_product_name=names.get(bom.finished_product_id, ""),
        version=bom.version,
        is_active=bom.is_active,
        notes=bom.notes,
        created_at=bom.created_at,
    )


async def _order_to_read(db: AsyncSession, order) -> ProductionOrderRead:
    bom_res = await db.execute(select(BillOfMaterials).where(BillOfMaterials.id == order.bom_id))
    bom = bom_res.scalar_one_or_none()
    branch_res = await db.execute(select(Branch).where(Branch.id == order.branch_id))
    branch = branch_res.scalar_one_or_none()
    data = ProductionOrderRead.model_validate(order).model_dump()
    data["bom_name"] = bom.name if bom else ""
    data["branch_name"] = branch.name if branch else ""
    return ProductionOrderRead(**data)


@router.post(
    "/production/boms",
    response_model=BillOfMaterialsRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_bom_endpoint(
    body: BomCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("production_orders", "create"),
) -> BillOfMaterialsRead:
    bom = await create_bom(
        db,
        name=body.name,
        finished_product_id=body.finished_product_id,
        version=body.version,
        notes=body.notes,
    )
    await audit_service.log(
        session=db,
        action="bom.created",
        resource_type="bill_of_materials",
        resource_id=str(bom.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    names = await _product_name_map(db, {bom.finished_product_id})
    return _bom_to_read(bom, names)


@router.get("/production/boms", response_model=list[BillOfMaterialsRead])
async def list_boms_endpoint(
    finished_product_id: int | None = Query(default=None),
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("production_orders", "read"),
) -> list[BillOfMaterialsRead]:
    boms = await list_boms(db, finished_product_id=finished_product_id, active_only=active_only)
    ids = {b.finished_product_id for b in boms}
    names = await _product_name_map(db, ids)
    return [_bom_to_read(b, names) for b in boms]


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


@router.get("/production/boms/{bom_id}", response_model=BillOfMaterialsDetailRead)
async def get_bom_endpoint(
    bom_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("production_orders", "read"),
) -> BillOfMaterialsDetailRead:
    bom = await get_bom(db, bom_id=bom_id)
    line_pids = {ln.component_product_id for ln in bom.lines}
    names = await _product_name_map(db, {bom.finished_product_id} | line_pids)
    lines = [
        BomLineRead(
            id=ln.id,
            component_product_id=ln.component_product_id,
            component_product_name=names.get(ln.component_product_id, ""),
            qty_required=ln.qty_required,
            unit_cost_at_creation=ln.unit_cost_at_creation,
            notes=ln.notes,
        )
        for ln in bom.lines
    ]
    base = _bom_to_read(bom, names)
    return BillOfMaterialsDetailRead(**base.model_dump(), lines=lines)


@router.patch("/production/boms/{bom_id}", response_model=BillOfMaterialsRead)
async def patch_bom_endpoint(
    bom_id: int,
    body: BomPatchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("production_orders", "update"),
) -> BillOfMaterialsRead:
    bom = await update_bom(
        db,
        bom_id=bom_id,
        name=body.name,
        version=body.version,
        notes=body.notes,
        is_active=body.is_active,
    )
    await audit_service.log(
        session=db,
        action="bom.updated",
        resource_type="bill_of_materials",
        resource_id=str(bom.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    names = await _product_name_map(db, {bom.finished_product_id})
    return _bom_to_read(bom, names)


@router.delete("/production/boms/{bom_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bom_endpoint(
    bom_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("production_orders", "update"),
) -> None:
    await delete_bom(db, bom_id=bom_id)
    await audit_service.log(
        session=db,
        action="bom.deleted_or_deactivated",
        resource_type="bill_of_materials",
        resource_id=str(bom_id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


@router.post(
    "/production/boms/{bom_id}/lines",
    response_model=BomLineRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_bom_line_endpoint(
    bom_id: int,
    body: BomLineCreateRequest,
    request: Request,
    branch_id: int = Query(..., description="Branch used for component unit-cost snapshot"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("production_orders", "update"),
) -> BomLineRead:
    ln = await add_bom_line(
        db,
        bom_id=bom_id,
        component_product_id=body.component_product_id,
        qty_required=body.qty_required,
        notes=body.notes,
        branch_id_for_cost_snapshot=branch_id,
    )
    await audit_service.log(
        session=db,
        action="bom_line.created",
        resource_type="bom_line",
        resource_id=str(ln.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    names = await _product_name_map(db, {ln.component_product_id})
    return BomLineRead(
        id=ln.id,
        component_product_id=ln.component_product_id,
        component_product_name=names.get(ln.component_product_id, ""),
        qty_required=ln.qty_required,
        unit_cost_at_creation=ln.unit_cost_at_creation,
        notes=ln.notes,
    )


@router.get("/production/orders", response_model=list[ProductionOrderRead])
async def list_production_orders_endpoint(
    branch_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("production_orders", "read"),
) -> list[ProductionOrderRead]:
    orders = await list_production_orders(
        db, branch_id=branch_id, status=status, limit=limit, offset=offset
    )
    return [await _order_to_read(db, o) for o in orders]


@router.get("/production/orders/{order_id}", response_model=ProductionOrderRead)
async def get_production_order_endpoint(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("production_orders", "read"),
) -> ProductionOrderRead:
    order = await get_production_order(db, production_order_id=order_id)
    return await _order_to_read(db, order)


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
    return await _order_to_read(db, order)


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
    return await _order_to_read(db, order)


@router.post(
    "/production/orders/{order_id}/complete",
    response_model=ProductionOrderRead,
)
async def complete_production_order_endpoint(
    order_id: int,
    body: ProductionOrderCompleteRequest,
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
        overhead_cost=body.overhead_cost,
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
    return await _order_to_read(db, order)
