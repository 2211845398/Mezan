"""Reorder alerts and draft PO creation."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.branch import BranchKind
from app.models.product import Product
from app.models.suppliers import Supplier
from app.schemas.inventory_reorder import (
    CommercialRestockAlertRow,
    CreatedPurchaseOrderRef,
    CreatePurchaseOrdersFromReorderRequest,
    CreatePurchaseOrdersFromReorderResponse,
    ReorderAlertRow,
)
from app.schemas.purchase_orders import PurchaseOrderCreate, PurchaseOrderLineCreate
from app.services.inventory_reporting_service import list_stock_on_hand
from app.services.inventory_valuation_service import get_unit_costs_for_sale
from app.services.purchase_order_service import create_po
from app.services.realtime_nav_badges import emit_inventory_stock_badges_invalidate
from app.utils.person_name import person_name_sql_expr


async def _product_base_uom_map(db: AsyncSession, product_ids: list[int]) -> dict[int, int]:
    if not product_ids:
        return {}
    unique_ids = list(dict.fromkeys(product_ids))
    res = await db.execute(select(Product.id, Product.uom_id).where(Product.id.in_(unique_ids)))
    uom_map = {int(pid): int(uid) for pid, uid in res.all()}
    missing = sorted(set(unique_ids) - set(uom_map))
    if missing:
        raise ValidationError("Product not found", details={"product_ids": missing})
    return uom_map


async def _supplier_name_map(db: AsyncSession, supplier_ids: set[int]) -> dict[int, str]:
    if not supplier_ids:
        return {}
    disp = person_name_sql_expr(Supplier.first_name, Supplier.father_name, Supplier.family_name)
    sres = await db.execute(select(Supplier.id, disp).where(Supplier.id.in_(supplier_ids)))
    return {int(i): str(n).strip() for i, n in sres.all() if n}


def _rows_to_reorder_alerts(
    rows: list,
    *,
    names: dict[int, str],
) -> list[ReorderAlertRow]:
    out: list[ReorderAlertRow] = []
    for r in rows:
        cover = r.available + r.on_order + r.in_transit_in
        sev = "out_of_stock" if r.available <= 0 else "below_reorder"
        sid = r.preferred_supplier_id
        out.append(
            ReorderAlertRow(
                branch_id=r.branch_id,
                branch_name=r.branch_name,
                product_id=r.product_id,
                sku=r.sku,
                product_name=r.product_name,
                available=r.available,
                on_order=r.on_order,
                in_transit_in=r.in_transit_in,
                cover=cover,
                reorder_point=int(r.reorder_point or 0),
                reorder_qty=int(r.reorder_qty or 0),
                preferred_supplier_id=sid,
                supplier_name=names.get(sid) if sid else None,
                severity=sev,
            )
        )
    return out


async def _list_stock_reorder_rows(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    branch_kind: BranchKind | None = None,
) -> list:
    return await list_stock_on_hand(
        db,
        branch_id=branch_id,
        branch_kind=branch_kind.value if branch_kind is not None else None,
        category_id=None,
        q=None,
        reorder_only=True,
        status=None,
        limit=500,
        offset=0,
    )


async def list_reorder_alerts(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
) -> list[ReorderAlertRow]:
    rows = await _list_stock_reorder_rows(
        db,
        branch_id=branch_id,
        branch_kind=BranchKind.WAREHOUSE,
    )
    supplier_ids = {r.preferred_supplier_id for r in rows if r.preferred_supplier_id}
    names = await _supplier_name_map(db, supplier_ids)
    return _rows_to_reorder_alerts(rows, names=names)


def _suggested_reorder_qty(*, reorder_qty: int, reorder_point: int, cover: int) -> int:
    if reorder_qty > 0:
        return reorder_qty
    return max(1, reorder_point - cover + 1)


async def _build_warehouse_source_by_variant(
    db: AsyncSession,
    *,
    variant_ids: list[int],
    qty_by_variant: dict[int, int],
) -> dict[int, tuple[int, str, int] | None]:
    if not variant_ids:
        return {}
    wh_rows = await list_stock_on_hand(
        db,
        branch_kind=BranchKind.WAREHOUSE.value,
        limit=500,
        offset=0,
    )
    by_variant: dict[int, list] = defaultdict(list)
    allow = set(variant_ids)
    for r in wh_rows:
        if r.variant_id in allow:
            by_variant[r.variant_id].append(r)

    out: dict[int, tuple[int, str, int] | None] = {}
    for vid in variant_ids:
        needed = qty_by_variant.get(vid, 1)
        eligible = [r for r in by_variant.get(vid, []) if r.available >= needed]
        if not eligible:
            out[vid] = None
            continue
        best = max(eligible, key=lambda r: r.available)
        out[vid] = (int(best.branch_id), str(best.branch_name), int(best.available))
    return out


async def _rows_to_commercial_restock_alerts(
    db: AsyncSession,
    rows: list,
    *,
    names: dict[int, str],
) -> list[CommercialRestockAlertRow]:
    if not rows:
        return []

    qty_by_variant: dict[int, int] = {}
    for r in rows:
        cover = r.available + r.on_order + r.in_transit_in
        qty_by_variant[int(r.variant_id)] = _suggested_reorder_qty(
            reorder_qty=int(r.reorder_qty or 0),
            reorder_point=int(r.reorder_point or 0),
            cover=cover,
        )

    variant_ids = list(qty_by_variant.keys())
    sources = await _build_warehouse_source_by_variant(
        db,
        variant_ids=variant_ids,
        qty_by_variant=qty_by_variant,
    )
    uom_map = await _product_base_uom_map(db, list({r.product_id for r in rows}))

    out: list[CommercialRestockAlertRow] = []
    for r in rows:
        cover = r.available + r.on_order + r.in_transit_in
        sev = "out_of_stock" if r.available <= 0 else "below_reorder"
        sid = r.preferred_supplier_id
        vid = int(r.variant_id)
        suggested_qty = qty_by_variant[vid]
        source = sources.get(vid)
        can_prefill = source is not None
        out.append(
            CommercialRestockAlertRow(
                branch_id=r.branch_id,
                branch_name=r.branch_name,
                product_id=r.product_id,
                sku=r.sku,
                product_name=r.product_name,
                available=r.available,
                on_order=r.on_order,
                in_transit_in=r.in_transit_in,
                cover=cover,
                reorder_point=int(r.reorder_point or 0),
                reorder_qty=int(r.reorder_qty or 0),
                preferred_supplier_id=sid,
                supplier_name=names.get(sid) if sid else None,
                severity=sev,
                variant_id=vid,
                variant_name=(r.variant_name or "").strip(),
                variant_sku=(r.variant_sku or "").strip(),
                reference_code=(r.reference_code or "").strip(),
                suggested_qty=suggested_qty,
                suggested_from_branch_id=source[0] if source else None,
                suggested_from_branch_name=source[1] if source else None,
                source_available=source[2] if source else 0,
                can_prefill_transfer=can_prefill,
                uom_id=uom_map.get(r.product_id),
                product_image_url=r.product_image_url,
            )
        )
    return out


async def list_commercial_restock_alerts(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
) -> list[CommercialRestockAlertRow]:
    rows = await _list_stock_reorder_rows(
        db,
        branch_id=branch_id,
        branch_kind=BranchKind.COMMERCIAL,
    )
    supplier_ids = {r.preferred_supplier_id for r in rows if r.preferred_supplier_id}
    names = await _supplier_name_map(db, supplier_ids)
    return await _rows_to_commercial_restock_alerts(db, rows, names=names)


async def count_reorder_alerts(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
) -> int:
    alerts = await list_reorder_alerts(db, branch_id=branch_id)
    return len(alerts)


async def count_commercial_restock_alerts(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
) -> int:
    alerts = await list_commercial_restock_alerts(db, branch_id=branch_id)
    return len(alerts)


async def create_purchase_orders_from_reorder(
    db: AsyncSession,
    *,
    user_id: int,
    body: CreatePurchaseOrdersFromReorderRequest,
) -> CreatePurchaseOrdersFromReorderResponse:
    alerts = await list_reorder_alerts(db, branch_id=None)
    if body.branch_ids:
        allow_b = set(body.branch_ids)
        alerts = [a for a in alerts if a.branch_id in allow_b]
    if body.product_ids:
        allow_p = set(body.product_ids)
        alerts = [a for a in alerts if a.product_id in allow_p]

    missing_supplier = [a for a in alerts if a.preferred_supplier_id is None]
    if missing_supplier:
        raise ValidationError(
            "All reorder alerts must have a preferred supplier to create a PO",
            details={"count_without_supplier": len(missing_supplier)},
        )

    grouped: dict[tuple[int, int], list[ReorderAlertRow]] = defaultdict(list)
    for a in alerts:
        grouped[(a.branch_id, int(a.preferred_supplier_id))].append(a)

    created: list[CreatedPurchaseOrderRef] = []
    for (bid, sup_id), group in grouped.items():
        lines: list[PurchaseOrderLineCreate] = []
        product_ids = [a.product_id for a in group]
        costs = await get_unit_costs_for_sale(db, branch_id=bid, product_ids=product_ids)
        uom_map = await _product_base_uom_map(db, product_ids)
        sup_name = group[0].supplier_name or "Supplier"
        disp = person_name_sql_expr(Supplier.first_name, Supplier.father_name, Supplier.family_name)
        sres = await db.execute(select(disp).where(Supplier.id == sup_id))
        sn = sres.scalar_one_or_none()
        if sn:
            sup_name = str(sn)

        for a in group:
            rq = _suggested_reorder_qty(
                reorder_qty=a.reorder_qty,
                reorder_point=a.reorder_point,
                cover=a.cover,
            )
            uc = costs.get(a.product_id, Decimal("0"))
            if uc <= 0:
                uc = Decimal("0.01")
            lines.append(
                PurchaseOrderLineCreate(
                    product_id=a.product_id,
                    qty=int(rq),
                    unit_cost=uc,
                    uom_id=uom_map[a.product_id],
                )
            )

        po_data = PurchaseOrderCreate(
            supplier_name=sup_name,
            supplier_id=sup_id,
            branch_id=bid,
            notes="Created from inventory reorder alerts",
            lines=lines,
        )
        po = await create_po(db, created_by_user_id=user_id, data=po_data.model_dump())
        created.append(
            CreatedPurchaseOrderRef(
                purchase_order_id=po.id,
                branch_id=bid,
                supplier_id=sup_id,
            )
        )

    await emit_inventory_stock_badges_invalidate()
    return CreatePurchaseOrdersFromReorderResponse(created=created)
