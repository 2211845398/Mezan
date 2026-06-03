"""Reorder alerts and draft PO creation."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.suppliers import Supplier
from app.schemas.inventory_reorder import (
    CreatedPurchaseOrderRef,
    CreatePurchaseOrdersFromReorderRequest,
    CreatePurchaseOrdersFromReorderResponse,
    ReorderAlertRow,
)
from app.schemas.purchase_orders import PurchaseOrderCreate, PurchaseOrderLineCreate
from app.services.inventory_reporting_service import list_stock_on_hand
from app.services.inventory_valuation_service import get_unit_costs_for_sale
from app.services.purchase_order_service import create_po
from app.utils.person_name import person_name_sql_expr


async def list_reorder_alerts(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
) -> list[ReorderAlertRow]:
    rows = await list_stock_on_hand(
        db,
        branch_id=branch_id,
        category_id=None,
        q=None,
        reorder_only=True,
        status=None,
        limit=500,
        offset=0,
    )
    supplier_ids = {r.preferred_supplier_id for r in rows if r.preferred_supplier_id}
    names: dict[int, str] = {}
    if supplier_ids:
        disp = person_name_sql_expr(Supplier.first_name, Supplier.father_name, Supplier.family_name)
        sres = await db.execute(select(Supplier.id, disp).where(Supplier.id.in_(supplier_ids)))
        names = {int(i): str(n).strip() for i, n in sres.all() if n}

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
        sup_name = group[0].supplier_name or "Supplier"
        disp = person_name_sql_expr(Supplier.first_name, Supplier.father_name, Supplier.family_name)
        sres = await db.execute(select(disp).where(Supplier.id == sup_id))
        sn = sres.scalar_one_or_none()
        if sn:
            sup_name = str(sn)

        for a in group:
            rq = a.reorder_qty if a.reorder_qty > 0 else max(1, a.reorder_point - a.cover + 1)
            uc = costs.get(a.product_id, Decimal("0"))
            if uc <= 0:
                uc = Decimal("0.01")
            lines.append(
                PurchaseOrderLineCreate(
                    product_id=a.product_id,
                    qty=int(rq),
                    unit_cost=uc,
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

    return CreatePurchaseOrdersFromReorderResponse(created=created)
