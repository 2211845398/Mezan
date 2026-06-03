"""Bill of Materials CRUD (Workstream F / Epic 20.3)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError, ValidationError
from app.models.bom import BillOfMaterials, BomLine, ProductionOrder
from app.models.product import Product
from app.services.inventory_valuation_service import get_unit_costs_for_sale
from app.utils.money import q2


async def list_boms(
    db: AsyncSession,
    *,
    finished_product_id: int | None = None,
    active_only: bool = True,
) -> list[BillOfMaterials]:
    stmt = select(BillOfMaterials).order_by(BillOfMaterials.name.asc())
    if active_only:
        stmt = stmt.where(BillOfMaterials.is_active)
    if finished_product_id is not None:
        stmt = stmt.where(BillOfMaterials.finished_product_id == finished_product_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def get_bom(db: AsyncSession, *, bom_id: int) -> BillOfMaterials:
    res = await db.execute(
        select(BillOfMaterials)
        .options(selectinload(BillOfMaterials.lines))
        .where(BillOfMaterials.id == bom_id)
    )
    bom = res.scalar_one_or_none()
    if not bom:
        raise NotFoundError("Bill of Materials not found", details={"bom_id": bom_id})
    return bom


async def create_bom(
    db: AsyncSession,
    *,
    name: str,
    finished_product_id: int,
    version: str,
    notes: str | None,
) -> BillOfMaterials:
    fp = await db.execute(select(Product).where(Product.id == finished_product_id))
    if fp.scalar_one_or_none() is None:
        raise NotFoundError(
            "Finished product not found", details={"product_id": finished_product_id}
        )

    bom = BillOfMaterials(
        name=name.strip(),
        finished_product_id=finished_product_id,
        version=version.strip() or "1.0",
        is_active=True,
        notes=notes,
    )
    db.add(bom)
    await db.flush()
    await db.refresh(bom)
    return bom


async def update_bom(
    db: AsyncSession,
    *,
    bom_id: int,
    name: str | None = None,
    version: str | None = None,
    notes: str | None = None,
    is_active: bool | None = None,
) -> BillOfMaterials:
    bom = await get_bom(db, bom_id=bom_id)
    if name is not None:
        bom.name = name.strip()
    if version is not None:
        bom.version = version.strip()
    if notes is not None:
        bom.notes = notes
    if is_active is not None:
        bom.is_active = is_active
    await db.flush()
    await db.refresh(bom)
    return bom


async def delete_bom(db: AsyncSession, *, bom_id: int) -> None:
    bom = await get_bom(db, bom_id=bom_id)
    po_res = await db.execute(
        select(ProductionOrder.id).where(ProductionOrder.bom_id == bom_id).limit(1)
    )
    if po_res.scalar_one_or_none() is not None:
        bom.is_active = False
        await db.flush()
        return
    await db.delete(bom)
    await db.flush()


async def add_bom_line(
    db: AsyncSession,
    *,
    bom_id: int,
    component_product_id: int,
    qty_required: Decimal,
    notes: str | None,
    branch_id_for_cost_snapshot: int,
) -> BomLine:
    bom = await get_bom(db, bom_id=bom_id)
    if not bom.is_active:
        raise ValidationError("Cannot add lines to an inactive BoM")

    cp = await db.execute(select(Product).where(Product.id == component_product_id))
    if cp.scalar_one_or_none() is None:
        raise NotFoundError(
            "Component product not found", details={"product_id": component_product_id}
        )

    if component_product_id == bom.finished_product_id:
        raise ValidationError("Component cannot be the same as finished product")

    costs = await get_unit_costs_for_sale(
        db, branch_id=branch_id_for_cost_snapshot, product_ids=[component_product_id]
    )
    unit_snap = costs.get(component_product_id)

    line = BomLine(
        bom_id=bom_id,
        component_product_id=component_product_id,
        qty_required=q2(qty_required),
        unit_cost_at_creation=q2(unit_snap) if unit_snap is not None else None,
        notes=notes,
    )
    db.add(line)
    await db.flush()
    await db.refresh(line)
    return line
