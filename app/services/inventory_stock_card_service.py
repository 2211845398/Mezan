"""Product-centric stock card (branches + recent movements)."""

from __future__ import annotations

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.branch import Branch
from app.models.category import Category
from app.models.inventory_policy import InventoryPolicy
from app.models.product import Product
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.schemas.inventory_stock import StockCardBranchRow, StockCardRead, StockMovementLedgerRead
from app.services.inventory_reporting_service import (
    _consumption_30d_map,
    _in_transit_in_map,
    _in_transit_out_map,
    _open_po_qty_map,
    _reorder_status,
)

async def get_product_stock_card(db: AsyncSession, *, product_id: int) -> StockCardRead:
    p_res = await db.execute(select(Product, Category).join(Category).where(Product.id == product_id))
    row = p_res.one_or_none()
    if not row:
        raise NotFoundError("Product not found", details={"product_id": product_id})
    prod, cat = row

    on_order_m = await _open_po_qty_map(db)
    in_in_m = await _in_transit_in_map(db)
    out_m = await _in_transit_out_map(db)
    cons_m = await _consumption_30d_map(db)

    stmt = (
        select(StockLevel, Branch, InventoryPolicy)
        .join(Branch, Branch.id == StockLevel.branch_id)
        .outerjoin(
            InventoryPolicy,
            and_(
                InventoryPolicy.branch_id == StockLevel.branch_id,
                InventoryPolicy.product_id == StockLevel.product_id,
            ),
        )
        .where(StockLevel.product_id == product_id)
        .order_by(Branch.name.asc())
    )
    res = await db.execute(stmt)
    level_rows = res.all()

    branches: list[StockCardBranchRow] = []
    for sl, br, pol in level_rows:
        oh = int(sl.on_hand)
        rv = int(sl.reserved)
        dm = int(sl.damaged)
        available = oh - rv - dm
        key = (sl.branch_id, product_id)
        on_order = on_order_m.get(key, 0)
        in_in = in_in_m.get(key, 0)
        in_out = out_m.get(key, 0)
        cover = available + on_order + in_in
        sold_30 = cons_m.get(key, 0)
        rate = sold_30 / 30.0 if sold_30 else 0.0
        days_cover: float | None = None
        if rate > 0 and available >= 0:
            days_cover = round(available / rate, 2)

        rp = int(pol.reorder_point) if pol and pol.is_active else None
        rq = int(pol.reorder_qty) if pol and pol.is_active else None
        psid = int(pol.preferred_supplier_id) if pol and pol.is_active and pol.preferred_supplier_id else None
        pol_active = bool(pol and pol.is_active)
        rstatus = _reorder_status(
            available=available,
            cover=cover,
            reorder_point=rp,
            policy_active=pol_active and rp is not None,
        )

        branches.append(
            StockCardBranchRow(
                branch_id=sl.branch_id,
                branch_name=br.name,
                on_hand=oh,
                reserved=rv,
                damaged=dm,
                available=available,
                on_order=on_order,
                in_transit_in=in_in,
                in_transit_out=in_out,
                reorder_point=rp,
                reorder_qty=rq,
                preferred_supplier_id=psid,
                reorder_status=rstatus,
                days_of_cover=days_cover,
                consumption_rate_30d=rate,
            )
        )

    mv_res = await db.execute(
        select(StockMovement)
        .where(StockMovement.product_id == product_id)
        .order_by(StockMovement.id.desc())
        .limit(50)
    )
    movements = mv_res.scalars().all()
    recent = [StockMovementLedgerRead.model_validate(m) for m in movements]

    return StockCardRead(
        product_id=prod.id,
        sku=prod.sku,
        product_name=prod.name,
        category_id=cat.id,
        category_name=cat.name,
        branches=branches,
        recent_movements=recent,
    )
