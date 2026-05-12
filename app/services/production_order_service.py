"""Production orders and BoM cost rollup (Epic 20.3).

Uses ``default_other_clearing_account_id`` as a clearing surrogate for WIP until a
dedicated WIP account exists on ``AccountingSettings``.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, StateTransitionError, ValidationError
from app.models.bom import BillOfMaterials, BomLine, ProductionOrder, ProductionOrderIssue, ProductionOrderReceipt
from app.models.product import Product
from app.services.accounting_service import get_accounting_settings, post_journal_entry
from app.services.inventory_service import apply_stock_movement
from app.services.inventory_valuation_service import get_unit_costs_for_sale
from app.utils.money import q2


def _as_stock_int(qty: Decimal) -> int:
    if qty % 1 != 0:
        raise ValidationError(
            "Quantities must be whole units for inventory movements",
            details={"qty": str(qty)},
        )
    i = int(qty)
    if i == 0:
        raise ValidationError("Quantity must not be zero for stock movement")
    return i


async def create_production_order(
    db: AsyncSession,
    *,
    bom_id: int,
    branch_id: int,
    qty_to_produce: Decimal,
    planned_start: datetime | None,
    planned_end: datetime | None,
    notes: str | None,
    user_id: int,
) -> ProductionOrder:
    bom_res = await db.execute(select(BillOfMaterials).where(BillOfMaterials.id == bom_id))
    bom = bom_res.scalar_one_or_none()
    if not bom or not bom.is_active:
        raise NotFoundError("Bill of Materials not found or inactive")

    order = ProductionOrder(
        order_number=f"PRO-{uuid4().hex[:16].upper()}",
        bom_id=bom_id,
        branch_id=branch_id,
        qty_to_produce=qty_to_produce,
        status="draft",
        planned_start=planned_start,
        planned_end=planned_end,
        notes=notes,
        created_by_user_id=user_id,
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


async def issue_materials(
    db: AsyncSession,
    *,
    production_order_id: int,
    idempotency_key: str,
    user_id: int,
) -> ProductionOrder:
    order_res = await db.execute(select(ProductionOrder).where(ProductionOrder.id == production_order_id))
    order = order_res.scalar_one_or_none()
    if not order:
        raise NotFoundError("Production order not found")
    if order.status != "draft":
        raise StateTransitionError("Materials can only be issued from a draft production order")

    bom_lines_res = await db.execute(select(BomLine).where(BomLine.bom_id == order.bom_id))
    bom_lines = list(bom_lines_res.scalars().all())
    if not bom_lines:
        raise ValidationError("Bill of Materials has no components")

    component_ids = [ln.component_product_id for ln in bom_lines]
    unit_costs = await get_unit_costs_for_sale(db, branch_id=order.branch_id, product_ids=component_ids)
    settings = await get_accounting_settings(db)
    wip_clearing = settings.default_other_clearing_account_id
    inventory_account = settings.default_inventory_account_id

    total_issued = Decimal("0")
    for i, bom_line in enumerate(bom_lines):
        qty_dec = q2(bom_line.qty_required * order.qty_to_produce)
        qty_int = _as_stock_int(qty_dec)
        unit_cost = unit_costs.get(bom_line.component_product_id, Decimal("0"))
        line_cost = q2(Decimal(qty_int) * unit_cost)

        issue = ProductionOrderIssue(
            production_order_id=order.id,
            product_id=bom_line.component_product_id,
            variant_id=None,
            qty_issued=Decimal(qty_int),
            unit_cost=unit_cost,
            total_cost=line_cost,
            issued_by_user_id=user_id,
        )
        db.add(issue)

        await apply_stock_movement(
            db,
            idempotency_key=f"{idempotency_key}:issue:{bom_line.id}:{i}",
            branch_id=order.branch_id,
            product_id=bom_line.component_product_id,
            qty_delta=-qty_int,
            reason="production_issue",
            ref_type="production_order",
            ref_id=str(order.id),
        )
        total_issued += line_cost

    if total_issued > 0:
        await post_journal_entry(
            db,
            entry_date=date.today(),
            description=f"Production order {order.order_number} — material issue",
            source_type="production_order",
            source_id=str(order.id),
            idempotency_key=f"{idempotency_key}:material_gl",
            lines=[
                {
                    "account_id": wip_clearing,
                    "branch_id": order.branch_id,
                    "debit": total_issued,
                    "credit": Decimal("0"),
                    "memo": "Production clearing (WIP surrogate)",
                },
                {
                    "account_id": inventory_account,
                    "branch_id": order.branch_id,
                    "debit": Decimal("0"),
                    "credit": total_issued,
                    "memo": "Inventory issued to production",
                },
            ],
        )

    order.total_cost_issued = total_issued
    order.status = "in_progress"
    order.actual_start = datetime.now(UTC)
    await db.flush()
    await db.refresh(order)
    return order


async def receive_finished_goods(
    db: AsyncSession,
    *,
    production_order_id: int,
    idempotency_key: str,
    user_id: int,
) -> ProductionOrder:
    order_res = await db.execute(select(ProductionOrder).where(ProductionOrder.id == production_order_id))
    order = order_res.scalar_one_or_none()
    if not order:
        raise NotFoundError("Production order not found")
    if order.status != "in_progress":
        raise StateTransitionError("Order must be in progress to receive finished goods")

    bom_res = await db.execute(select(BillOfMaterials).where(BillOfMaterials.id == order.bom_id))
    bom = bom_res.scalar_one()

    qty_int = _as_stock_int(order.qty_to_produce)
    issued = order.total_cost_issued
    unit_cost = q2(issued / Decimal(qty_int)) if issued > 0 else Decimal("0")
    total_value = issued

    receipt = ProductionOrderReceipt(
        production_order_id=order.id,
        product_id=bom.finished_product_id,
        variant_id=None,
        qty_received=Decimal(qty_int),
        unit_cost=unit_cost,
        total_cost=total_value,
        received_by_user_id=user_id,
    )
    db.add(receipt)

    await apply_stock_movement(
        db,
        idempotency_key=f"{idempotency_key}:receipt",
        branch_id=order.branch_id,
        product_id=bom.finished_product_id,
        qty_delta=qty_int,
        reason="production_receipt",
        ref_type="production_order",
        ref_id=str(order.id),
    )

    settings = await get_accounting_settings(db)
    wip_clearing = settings.default_other_clearing_account_id
    inventory_account = settings.default_inventory_account_id

    if total_value > 0:
        await post_journal_entry(
            db,
            entry_date=date.today(),
            description=f"Production order {order.order_number} — finished goods",
            source_type="production_order",
            source_id=str(order.id),
            idempotency_key=f"{idempotency_key}:receipt_gl",
            lines=[
                {
                    "account_id": inventory_account,
                    "branch_id": order.branch_id,
                    "debit": total_value,
                    "credit": Decimal("0"),
                    "memo": "Finished goods from production",
                },
                {
                    "account_id": wip_clearing,
                    "branch_id": order.branch_id,
                    "debit": Decimal("0"),
                    "credit": total_value,
                    "memo": "Clear production clearing (WIP surrogate)",
                },
            ],
        )

    order.qty_produced = Decimal(qty_int)
    order.finished_goods_value = total_value
    order.status = "completed"
    order.actual_end = datetime.now(UTC)
    await db.flush()
    await db.refresh(order)
    return order


async def calculate_bom_cost(
    db: AsyncSession,
    *,
    bom_id: int,
    branch_id: int,
    qty: Decimal = Decimal("1"),
) -> dict:
    bom_res = await db.execute(select(BillOfMaterials).where(BillOfMaterials.id == bom_id))
    bom = bom_res.scalar_one_or_none()
    if not bom:
        raise NotFoundError("Bill of Materials not found")

    lines_res = await db.execute(select(BomLine).where(BomLine.bom_id == bom_id))
    bom_lines = list(lines_res.scalars().all())
    if not bom_lines:
        raise ValidationError("Bill of Materials has no components")

    component_ids = [ln.component_product_id for ln in bom_lines]
    unit_costs = await get_unit_costs_for_sale(db, branch_id=branch_id, product_ids=component_ids)

    prod_res = await db.execute(select(Product).where(Product.id.in_(component_ids)))
    products = {p.id: p for p in prod_res.scalars().all()}

    lines_out: list[dict] = []
    total = Decimal("0")
    for ln in bom_lines:
        uc = unit_costs.get(ln.component_product_id, Decimal("0"))
        line_qty = q2(ln.qty_required * qty)
        line_cost = q2(line_qty * uc)
        total += line_cost
        p = products.get(ln.component_product_id)
        lines_out.append(
            {
                "product_id": ln.component_product_id,
                "product_name": p.name if p else "",
                "qty": line_qty,
                "unit_cost": uc,
                "line_cost": line_cost,
            }
        )

    unit = q2(total / qty) if qty > 0 else Decimal("0")
    return {
        "bom_id": bom_id,
        "finished_product_id": bom.finished_product_id,
        "qty": qty,
        "unit_cost": unit,
        "total_cost": total,
        "lines": lines_out,
    }
