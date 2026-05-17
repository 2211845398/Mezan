"""Goods receipt orchestration (PO-linked receiving, Epic W-5.4)."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.goods_receipt import GoodsReceipt
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.stock_level import StockLevel
from app.models.suppliers import Supplier
from app.utils.person_name import display_person_name
from app.services.branch_scope import require_branch_open_for_operations
from app.services.document_posting_service import post_goods_receipt_gl
from app.services.fifo_valuation_service import create_cost_layer, get_valuation_policy
from app.services.inventory_service import apply_stock_movement
from app.services.inventory_valuation_service import apply_receipt_to_weighted_average


async def _qty_received_by_po_line(db: AsyncSession, *, purchase_order_id: int) -> dict[int, int]:
    q = (
        select(
            GoodsReceiptLine.purchase_order_line_id,
            func.coalesce(func.sum(GoodsReceiptLine.qty), 0),
        )
        .join(GoodsReceipt, GoodsReceiptLine.goods_receipt_id == GoodsReceipt.id)
        .where(
            and_(
                GoodsReceipt.purchase_order_id == purchase_order_id,
                GoodsReceiptLine.purchase_order_line_id.isnot(None),
            )
        )
        .group_by(GoodsReceiptLine.purchase_order_line_id)
    )
    res = await db.execute(q)
    return {int(r[0]): int(r[1]) for r in res.all() if r[0] is not None}


async def receive_goods_for_purchase_order(
    db: AsyncSession,
    *,
    purchase_order_id: int,
    branch_id: int,
    lines: list[dict[str, Any]],
    idempotency_key: str,
    created_by_user_id: int | None,
) -> GoodsReceipt:
    if len(idempotency_key) < 8:
        raise ValidationError(
            "idempotency_key must be at least 8 characters",
            details={"field": "idempotency_key"},
        )

    existing = await db.execute(
        select(GoodsReceipt).where(GoodsReceipt.idempotency_key == idempotency_key)
    )
    prior = existing.scalar_one_or_none()
    if prior:
        if prior.purchase_order_id != purchase_order_id:
            raise ConflictError(
                "Idempotency key already used for a different receipt",
                details={"goods_receipt_id": prior.id},
            )
        return prior

    po = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.id == purchase_order_id)
    )
    purchase_order = po.scalar_one_or_none()
    if not purchase_order:
        raise NotFoundError("Purchase order not found", details={"po_id": purchase_order_id})

    if purchase_order.status in {"draft", "cancelled", "closed"}:
        raise ValidationError(
            "Cannot receive goods for this purchase order status",
            details={"status": purchase_order.status},
        )

    if purchase_order.branch_id is not None and purchase_order.branch_id != branch_id:
        raise ValidationError(
            "branch_id must match the purchase order branch",
            details={"expected_branch_id": purchase_order.branch_id},
        )

    await require_branch_open_for_operations(db, branch_id)

    po_line_by_id: dict[int, PurchaseOrderLine] = {ln.id: ln for ln in purchase_order.lines}
    received_so_far = await _qty_received_by_po_line(db, purchase_order_id=purchase_order_id)

    if not lines:
        raise ValidationError("At least one receipt line is required")

    planned: dict[int, int] = defaultdict(int)
    for raw in lines:
        pol_id = raw.get("purchase_order_line_id")
        qty = raw.get("qty")
        if not isinstance(pol_id, int) or not isinstance(qty, int):
            raise ValidationError(
                "Each line needs purchase_order_line_id (int) and qty (int)",
                details={"line": raw},
            )
        if qty <= 0:
            raise ValidationError(
                "qty must be positive", details={"purchase_order_line_id": pol_id}
            )
        planned[pol_id] += qty

    receipt_lines_payload: list[tuple[int, int, Decimal, PurchaseOrderLine]] = []
    for pol_id, qty in planned.items():
        pol = po_line_by_id.get(pol_id)
        if not pol:
            raise ValidationError(
                "Unknown purchase_order_line_id for this PO",
                details={"purchase_order_line_id": pol_id},
            )
        already = received_so_far.get(pol_id, 0)
        if already + qty > pol.qty:
            raise ValidationError(
                "Received quantity exceeds ordered quantity for line",
                details={
                    "purchase_order_line_id": pol_id,
                    "ordered": pol.qty,
                    "already_received": already,
                    "requested": qty,
                },
            )
        unit_cost = pol.unit_cost
        receipt_lines_payload.append((pol_id, qty, unit_cost, pol))

    supplier_id = purchase_order.supplier_id
    supplier_name = purchase_order.supplier_name
    if supplier_id:
        sres = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
        sup = sres.scalar_one_or_none()
        if sup:
            supplier_name = display_person_name(sup.first_name, sup.father_name, sup.family_name)

    receipt = GoodsReceipt(
        branch_id=branch_id,
        purchase_order_id=purchase_order_id,
        supplier_name=supplier_name,
        supplier_id=supplier_id,
        source_invoice_scan_id=None,
        idempotency_key=idempotency_key,
        created_by_user_id=created_by_user_id,
    )
    db.add(receipt)
    await db.flush()

    valuation_pol = await get_valuation_policy(db)

    for i, (pol_id, qty, unit_cost, pol) in enumerate(receipt_lines_payload):
        line_variant_id = pol.variant_id
        db.add(
            GoodsReceiptLine(
                goods_receipt_id=receipt.id,
                purchase_order_line_id=pol_id,
                product_id=pol.product_id,
                variant_id=line_variant_id,
                qty=qty,
                unit_cost=unit_cost,
            )
        )
        sl_res = await db.execute(
            select(StockLevel.on_hand).where(
                and_(
                    StockLevel.branch_id == branch_id,
                    StockLevel.product_id == pol.product_id,
                    StockLevel.variant_id == line_variant_id,
                )
            )
        )
        qty_on_hand_before = int(sl_res.scalar_one_or_none() or 0)
        await apply_stock_movement(
            db,
            idempotency_key=f"goods_receipt:{receipt.id}:line:{i}",
            branch_id=branch_id,
            product_id=pol.product_id,
            qty_delta=qty,
            reason="goods_receipt",
            ref_type="goods_receipt",
            ref_id=str(receipt.id),
            variant_id=line_variant_id,
        )
        await apply_receipt_to_weighted_average(
            db,
            branch_id=branch_id,
            product_id=pol.product_id,
            qty_in=qty,
            unit_cost=unit_cost,
            qty_on_hand_before=qty_on_hand_before,
            variant_id=line_variant_id,
        )
        if valuation_pol == "fifo":
            await create_cost_layer(
                db,
                branch_id=branch_id,
                product_id=pol.product_id,
                variant_id=line_variant_id,
                source_type="goods_receipt",
                source_id=f"{receipt.id}:{i}",
                qty=Decimal(qty),
                unit_cost=unit_cost,
            )

    await post_goods_receipt_gl(db, receipt=receipt)
    await db.commit()
    await db.refresh(receipt)
    return receipt
