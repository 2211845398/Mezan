"""Read-only stock-on-hand joined view for inventory UI (W-5.3 + operations redesign)."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.category import Category
from app.models.inventory_policy import InventoryPolicy
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.models.transfer_batch import TransferBatch
from app.models.transfer_line import TransferLine
from app.schemas.inventory_stock import StockOnHandRowRead
from app.services.inventory_valuation_service import get_unit_costs_for_sale
from app.utils.variant_display import variant_attributes_summary

COST_Q = Decimal("0.0001")
OPEN_PO_STATUSES: tuple[str, ...] = ("draft", "sent", "tracked")

# branch_id, product_id, variant_id (None = PO line without preset variant)
OpenPoQtyKey = tuple[int, int, int | None]


def _q(value: Decimal) -> Decimal:
    return value.quantize(COST_Q)


def _on_order_qty_for_branch_product(
    on_order_m: dict[OpenPoQtyKey, int], *, branch_id: int, product_id: int
) -> int:
    """Sum open PO qty for a product at a branch (variant-specific + deferred-variant lines)."""
    return sum(
        qty
        for (bid, pid, _vid), qty in on_order_m.items()
        if bid == branch_id and pid == product_id
    )


async def _open_po_qty_map(db: AsyncSession) -> dict[OpenPoQtyKey, int]:
    stmt = (
        select(
            PurchaseOrder.branch_id,
            PurchaseOrderLine.product_id,
            PurchaseOrderLine.variant_id,
            func.coalesce(func.sum(PurchaseOrderLine.qty), 0),
        )
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
            PurchaseOrder.branch_id.is_not(None),
        )
        .group_by(PurchaseOrder.branch_id, PurchaseOrderLine.product_id, PurchaseOrderLine.variant_id)
    )
    res = await db.execute(stmt)
    out: dict[OpenPoQtyKey, int] = {}
    for bid, pid, vid, qty in res.all():
        if bid is None:
            continue
        safe_vid = int(vid) if vid is not None else None
        out[(int(bid), int(pid), safe_vid)] = int(qty)
    return out


async def _in_transit_in_map(db: AsyncSession) -> dict[tuple[int, int, int], int]:
    stmt = (
        select(
            TransferBatch.to_branch_id,
            TransferLine.product_id,
            TransferLine.variant_id,
            func.coalesce(func.sum(TransferLine.qty), 0),
        )
        .join(TransferLine, TransferLine.transfer_batch_id == TransferBatch.id)
        .where(TransferBatch.status == "in_transit")
        .group_by(TransferBatch.to_branch_id, TransferLine.product_id, TransferLine.variant_id)
    )
    res = await db.execute(stmt)
    return {(int(b), int(p), int(v)): int(q) for b, p, v, q in res.all()}


async def _in_transit_out_map(db: AsyncSession) -> dict[tuple[int, int, int], int]:
    stmt = (
        select(
            TransferBatch.from_branch_id,
            TransferLine.product_id,
            TransferLine.variant_id,
            func.coalesce(func.sum(TransferLine.qty), 0),
        )
        .join(TransferLine, TransferLine.transfer_batch_id == TransferBatch.id)
        .where(TransferBatch.status == "in_transit")
        .group_by(TransferBatch.from_branch_id, TransferLine.product_id, TransferLine.variant_id)
    )
    res = await db.execute(stmt)
    return {(int(b), int(p), int(v)): int(q) for b, p, v, q in res.all()}


async def _consumption_30d_map(db: AsyncSession) -> dict[tuple[int, int, int], int]:
    since = datetime.now(UTC) - timedelta(days=30)
    stmt = (
        select(
            StockMovement.branch_id,
            StockMovement.product_id,
            StockMovement.variant_id,
            func.coalesce(func.sum(-StockMovement.qty_delta), 0),
        )
        .where(
            StockMovement.reason == "sale",
            StockMovement.qty_delta < 0,
            StockMovement.created_at >= since,
        )
        .group_by(StockMovement.branch_id, StockMovement.product_id, StockMovement.variant_id)
    )
    res = await db.execute(stmt)
    return {(int(b), int(p), int(v)): int(q) for b, p, v, q in res.all()}


def _reorder_status(
    *,
    available: int,
    cover: int,
    reorder_point: int | None,
    policy_active: bool,
) -> str:
    if not policy_active or reorder_point is None:
        return "none"
    if available <= 0:
        return "out_of_stock"
    if cover <= reorder_point:
        return "below_reorder"
    return "ok"


async def list_stock_on_hand(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    category_id: int | None = None,
    q: str | None = None,
    reorder_only: bool = False,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
    sort: str | None = None,
) -> list[StockOnHandRowRead]:
    on_order_m = await _open_po_qty_map(db)
    in_in_m = await _in_transit_in_map(db)
    out_m = await _in_transit_out_map(db)
    cons_m = await _consumption_30d_map(db)

    stmt = (
        select(StockLevel, Product, Category, Branch, InventoryPolicy, ProductVariant)
        .join(Product, Product.id == StockLevel.product_id)
        .join(ProductVariant, ProductVariant.id == StockLevel.variant_id)
        .join(Category, Category.id == Product.category_id)
        .join(Branch, Branch.id == StockLevel.branch_id)
        .outerjoin(
            InventoryPolicy,
            and_(
                InventoryPolicy.branch_id == StockLevel.branch_id,
                InventoryPolicy.product_id == StockLevel.product_id,
            ),
        )
    )
    if branch_id is not None:
        stmt = stmt.where(StockLevel.branch_id == branch_id)
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                Product.sku.ilike(like),
                ProductVariant.sku.ilike(like),
            )
        )

    order_col = sort or "branch_sku"
    if order_col == "available_asc":
        stmt = stmt.order_by(
            (StockLevel.on_hand - StockLevel.reserved - StockLevel.damaged).asc(),
            ProductVariant.sku.asc(),
        )
    else:
        stmt = stmt.order_by(Branch.name.asc(), ProductVariant.sku.asc())

    stmt = stmt.limit(min(max(limit, 1), 500)).offset(max(offset, 0))
    res = await db.execute(stmt)
    rows = res.all()
    if not rows:
        return []

    by_branch: dict[
        int,
        list[tuple[StockLevel, Product, Category, Branch, InventoryPolicy | None, ProductVariant]],
    ] = defaultdict(list)
    for sl, prod, cat, br, pol, pv in rows:
        by_branch[sl.branch_id].append((sl, prod, cat, br, pol, pv))

    out: list[StockOnHandRowRead] = []
    for bid, group in by_branch.items():
        pids = [p.id for _, p, _, _, _, _ in group]
        costs = await get_unit_costs_for_sale(db, branch_id=bid, product_ids=pids)
        for sl, prod, cat, br, pol, pv in group:
            uc = _q(costs.get(prod.id, _q(Decimal("0"))))
            oh = int(sl.on_hand)
            rv = int(sl.reserved)
            dm = int(sl.damaged)
            available = oh - rv - dm
            key = (sl.branch_id, prod.id, sl.variant_id)
            on_order_variant = on_order_m.get(key, 0)
            on_order_product = _on_order_qty_for_branch_product(
                on_order_m, branch_id=sl.branch_id, product_id=prod.id
            )
            in_in = in_in_m.get(key, 0)
            in_out = out_m.get(key, 0)
            cover = available + on_order_product + in_in
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

            ext = _q(uc * Decimal(oh))
            attr_summary = variant_attributes_summary(pv.attribute_values)
            out.append(
                StockOnHandRowRead(
                    branch_id=sl.branch_id,
                    branch_name=br.name,
                    product_id=prod.id,
                    variant_id=sl.variant_id,
                    sku=prod.sku,
                    variant_sku=pv.sku,
                    variant_attributes=attr_summary,
                    product_name=prod.name,
                    product_image_url=prod.image_url,
                    category_id=cat.id,
                    category_name=cat.name,
                    on_hand=oh,
                    reserved=rv,
                    damaged=dm,
                    available=available,
                    unit_cost=uc,
                    extended_cost=ext,
                    on_order=on_order_variant,
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

    if reorder_only:
        out = [r for r in out if r.reorder_status in ("below_reorder", "out_of_stock")]
    if status and status != "all":
        out = [r for r in out if r.reorder_status == status]

    if order_col == "available_asc":
        out.sort(key=lambda r: (r.available, r.variant_sku or r.sku))

    return out


async def list_stock_movements_with_names(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    product_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """Ledger rows for inventory UI with branch and product labels."""
    stmt = (
        select(
            StockMovement,
            Branch.name.label("branch_name"),
            Product.name.label("product_name"),
        )
        .join(Branch, Branch.id == StockMovement.branch_id)
        .join(Product, Product.id == StockMovement.product_id)
        .order_by(StockMovement.id.desc())
        .limit(limit)
        .offset(offset)
    )
    if branch_id is not None:
        stmt = stmt.where(StockMovement.branch_id == branch_id)
    if product_id is not None:
        stmt = stmt.where(StockMovement.product_id == product_id)
    res = await db.execute(stmt)
    rows: list[dict] = []
    for r, branch_name, product_name in res.all():
        rows.append(
            {
                "id": r.id,
                "branch_id": r.branch_id,
                "branch_name": branch_name,
                "product_id": r.product_id,
                "product_name": product_name,
                "qty_delta": r.qty_delta,
                "reason": r.reason,
                "ref_type": r.ref_type,
                "ref_id": r.ref_id,
                "movement_kind": r.movement_kind,
                "notes": r.notes,
                "user_id": r.user_id,
                "reserved_delta": r.reserved_delta,
                "damaged_delta": r.damaged_delta,
                "created_at": r.created_at,
            }
        )
    return rows
