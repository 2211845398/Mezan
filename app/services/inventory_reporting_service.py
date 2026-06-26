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
from app.schemas.inventory_stock import (
    StockFinderBranchBrief,
    StockFinderBranchQty,
    StockFinderResultRead,
    StockOnHandRowRead,
)
from app.services.inventory_valuation_service import get_unit_costs_for_sale
from app.utils.variant_display import variant_attributes_summary, variant_value_labels_summary

STOCK_ON_HAND_MAX_LIMIT = 2000

COST_Q = Decimal("0.0001")
OPEN_PO_STATUSES: tuple[str, ...] = ("sent", "tracked")

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
            func.coalesce(func.sum(PurchaseOrderLine.qty_base), 0),
        )
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
            PurchaseOrder.branch_id.is_not(None),
        )
        .group_by(
            PurchaseOrder.branch_id, PurchaseOrderLine.product_id, PurchaseOrderLine.variant_id
        )
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
            func.coalesce(func.sum(TransferLine.qty_base), 0),
        )
        .join(TransferLine, TransferLine.transfer_batch_id == TransferBatch.id)
        .where(TransferBatch.status == "in_transit")
        .group_by(TransferBatch.to_branch_id, TransferLine.product_id, TransferLine.variant_id)
    )
    res = await db.execute(stmt)
    return {(int(b), int(p), int(v)): int(q) for b, p, v, q in res.all()}


async def _pending_incoming_transfer_map(db: AsyncSession) -> dict[tuple[int, int, int], int]:
    """Qty on pending_dispatch transfers inbound to each branch (not yet in transit)."""
    stmt = (
        select(
            TransferBatch.to_branch_id,
            TransferLine.product_id,
            TransferLine.variant_id,
            func.coalesce(func.sum(TransferLine.qty_base), 0),
        )
        .join(TransferLine, TransferLine.transfer_batch_id == TransferBatch.id)
        .where(TransferBatch.status == "pending_dispatch")
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
            func.coalesce(func.sum(TransferLine.qty_base), 0),
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
    branch_kind: str | None = None,
    category_id: int | None = None,
    category_ids: set[int] | None = None,
    variant_id: int | None = None,
    q: str | None = None,
    reorder_only: bool = False,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
    sort: str | None = None,
) -> list[StockOnHandRowRead]:
    on_order_m = await _open_po_qty_map(db)
    in_in_m = await _in_transit_in_map(db)
    pending_in_m = await _pending_incoming_transfer_map(db)
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
    if branch_kind is not None:
        stmt = stmt.where(Branch.kind == branch_kind)
    if variant_id is not None:
        stmt = stmt.where(StockLevel.variant_id == variant_id)
    if category_ids is not None:
        stmt = stmt.where(Product.category_id.in_(category_ids))
    elif category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                Product.sku.ilike(like),
                Category.name.ilike(like),
                ProductVariant.sku.ilike(like),
                ProductVariant.reference_code.ilike(like),
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

    stmt = stmt.limit(min(max(limit, 1), STOCK_ON_HAND_MAX_LIMIT)).offset(max(offset, 0))
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
            pending_in = pending_in_m.get(key, 0)
            in_out = out_m.get(key, 0)
            cover = available + on_order_product + in_in + pending_in
            sold_30 = cons_m.get(key, 0)
            rate = sold_30 / 30.0 if sold_30 else 0.0
            days_cover: float | None = None
            if rate > 0 and available >= 0:
                days_cover = round(available / rate, 2)

            rp = int(pol.reorder_point) if pol and pol.is_active else None
            rq = int(pol.reorder_qty) if pol and pol.is_active else None
            psid = (
                int(pol.preferred_supplier_id)
                if pol and pol.is_active and pol.preferred_supplier_id
                else None
            )
            pol_active = bool(pol and pol.is_active)
            rstatus = _reorder_status(
                available=available,
                cover=cover,
                reorder_point=rp,
                policy_active=pol_active and rp is not None,
            )

            ext = _q(uc * Decimal(oh))
            attr_summary = variant_attributes_summary(pv.attribute_values)
            variant_name = variant_value_labels_summary(pv.attribute_values) or prod.name
            ref_code = (pv.reference_code or "").strip()
            out.append(
                StockOnHandRowRead(
                    branch_id=sl.branch_id,
                    branch_name=br.name,
                    product_id=prod.id,
                    variant_id=sl.variant_id,
                    sku=prod.sku,
                    variant_sku=pv.sku,
                    variant_attributes=attr_summary,
                    variant_name=variant_name,
                    reference_code=ref_code,
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


STOCK_FINDER_MAX_RESULTS = 25
STOCK_FINDER_FETCH_LIMIT = 500


def _row_to_branch_qty(row: StockOnHandRowRead) -> StockFinderBranchQty:
    return StockFinderBranchQty(
        branch_id=row.branch_id,
        branch_name=row.branch_name,
        available=row.available,
        on_hand=row.on_hand,
        reserved=row.reserved,
        damaged=row.damaged,
        in_transit_in=row.in_transit_in,
    )


async def list_stock_finder_branches(db: AsyncSession) -> list[StockFinderBranchBrief]:
    """Active branches for mobile stock finder (no ``branches:read`` required)."""
    result = await db.execute(
        select(Branch.id, Branch.name, Branch.code)
        .where(Branch.is_active.is_(True), Branch.archived_at.is_(None))
        .order_by(Branch.name.asc())
    )
    return [
        StockFinderBranchBrief(id=int(row.id), name=row.name, code=row.code) for row in result.all()
    ]


async def stock_finder(
    db: AsyncSession,
    *,
    q: str,
    current_branch_id: int | None = None,
    current_branch_name: str | None = None,
    limit: int = STOCK_FINDER_MAX_RESULTS,
) -> list[StockFinderResultRead]:
    """Group stock-on-hand rows by variant for mobile floor lookup."""
    query = q.strip()
    if not query:
        return []

    rows = await list_stock_on_hand(
        db,
        q=query,
        limit=STOCK_FINDER_FETCH_LIMIT,
        offset=0,
    )
    if not rows:
        return []

    by_variant: dict[int, list[StockOnHandRowRead]] = defaultdict(list)
    for row in rows:
        by_variant[row.variant_id].append(row)

    results: list[StockFinderResultRead] = []
    safe_limit = min(max(limit, 1), STOCK_FINDER_MAX_RESULTS)

    for branch_rows in by_variant.values():
        sample = branch_rows[0]
        current: StockFinderBranchQty | None = None
        others: list[StockFinderBranchQty] = []

        for row in branch_rows:
            qty = _row_to_branch_qty(row)
            if current_branch_id is not None and row.branch_id == current_branch_id:
                current = qty
            else:
                others.append(qty)

        if current_branch_id is not None and current is None:
            name = current_branch_name or ""
            if not name:
                br = await db.get(Branch, current_branch_id)
                name = br.name if br else ""
            current = StockFinderBranchQty(
                branch_id=current_branch_id,
                branch_name=name,
                available=0,
                on_hand=0,
                reserved=0,
                damaged=0,
                in_transit_in=0,
            )

        others.sort(key=lambda b: (-b.available, b.branch_name.lower()))

        results.append(
            StockFinderResultRead(
                product_id=sample.product_id,
                variant_id=sample.variant_id,
                product_name=sample.product_name,
                variant_name=sample.variant_name or sample.product_name,
                sku=sample.sku,
                variant_sku=sample.variant_sku,
                barcode=sample.reference_code,
                current_branch=current,
                other_branches=others,
            )
        )

    def _sort_key(item: StockFinderResultRead) -> tuple[int, int, str]:
        cur = item.current_branch.available if item.current_branch else -1
        max_other = max((b.available for b in item.other_branches), default=0)
        best = cur if cur >= 0 else max_other
        return (-best, -cur if cur >= 0 else 0, item.product_name.lower())

    results.sort(key=_sort_key)
    return results[:safe_limit]


async def list_stock_movements_with_names(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    product_id: int | None = None,
    variant_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """Ledger rows for inventory UI with branch and product labels."""
    stmt = (
        select(
            StockMovement,
            Branch.name.label("branch_name"),
            Product.name.label("product_name"),
            ProductVariant,
        )
        .join(Branch, Branch.id == StockMovement.branch_id)
        .join(Product, Product.id == StockMovement.product_id)
        .join(ProductVariant, ProductVariant.id == StockMovement.variant_id)
        .order_by(StockMovement.id.desc())
        .limit(limit)
        .offset(offset)
    )
    if branch_id is not None:
        stmt = stmt.where(StockMovement.branch_id == branch_id)
    if product_id is not None:
        stmt = stmt.where(StockMovement.product_id == product_id)
    if variant_id is not None:
        stmt = stmt.where(StockMovement.variant_id == variant_id)
    res = await db.execute(stmt)
    rows: list[dict] = []
    for r, branch_name, product_name, pv in res.all():
        variant_name = variant_value_labels_summary(pv.attribute_values) or product_name
        rows.append(
            {
                "id": r.id,
                "branch_id": r.branch_id,
                "branch_name": branch_name,
                "product_id": r.product_id,
                "product_name": product_name,
                "variant_id": r.variant_id,
                "variant_name": variant_name,
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
