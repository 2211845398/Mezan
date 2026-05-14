"""Inventory adjustment GL posting service (Epic 19.6).

Posts double-entry for inventory adjustments (damage, shortage, write-offs,
and positive adjustments) using weighted-average or FIFO policy.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.branch_product_costs import BranchProductCost
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.services.accounting_service import get_accounting_settings, post_journal_entry
from app.services.fifo_valuation_service import consume_layers_fifo, get_fifo_unit_cost, get_valuation_policy
from app.utils.money import q2


def _negative_adjustment_expense_account_id(settings, reason: str) -> int:
    r = (reason or "").strip().lower()
    if r in {"damaged", "damage"}:
        return int(settings.default_inventory_damaged_account_id or settings.default_cogs_account_id)
    if r in {"shortage", "count_loss"}:
        return int(settings.default_inventory_shortage_account_id or settings.default_cogs_account_id)
    return int(settings.default_cogs_account_id)


async def _extended_cost_for_adjustment(
    db: AsyncSession,
    *,
    movement: StockMovement,
) -> Decimal:
    """Extended cost in base currency for the movement quantity (absolute qty)."""
    policy = await get_valuation_policy(db)
    qty_abs = Decimal(abs(movement.qty_delta))

    if movement.qty_delta < 0 and policy == "fifo":
        consumed = await consume_layers_fifo(
            db,
            branch_id=movement.branch_id,
            product_id=movement.product_id,
            variant_id=movement.variant_id,
            qty_to_consume=qty_abs,
        )
        ext_cost = Decimal("0")
        for take, uc in consumed:
            ext_cost += q2(take * uc)
        return q2(ext_cost)

    unit_cost = Decimal("0")
    result = await db.execute(
        select(BranchProductCost)
        .where(
            BranchProductCost.branch_id == movement.branch_id,
            BranchProductCost.product_id == movement.product_id,
            BranchProductCost.variant_id == movement.variant_id,
        )
    )
    cost_record = result.scalar_one_or_none()
    if cost_record:
        unit_cost = cost_record.average_unit_cost

    if unit_cost == 0 and movement.product_id:
        result = await db.execute(
            select(Product.standard_cost).where(Product.id == movement.product_id)
        )
        sc = result.scalar_one_or_none()
        if sc is not None:
            unit_cost = Decimal(str(sc))

    if movement.qty_delta > 0 and policy == "fifo":
        fifo_uc = await get_fifo_unit_cost(
            db,
            branch_id=movement.branch_id,
            product_id=movement.product_id,
            variant_id=movement.variant_id,
        )
        if fifo_uc > 0:
            unit_cost = fifo_uc
        elif unit_cost == 0:
            unit_cost = fifo_uc

    return q2(unit_cost * qty_abs)


async def post_stock_movement_gl(
    db: AsyncSession,
    *,
    movement: StockMovement,
    entry_date: date | None = None,
    idempotency_key: str | None = None,
) -> dict:
    """Post GL entries for a stock movement that represents an adjustment.

    For negative qty_delta (loss/damage/shortage):
    - Dr Expense (COGS/Shrinkage/Damage)
    - Cr Inventory

    For positive qty_delta (found excess, returned to stock):
    - Dr Inventory
    - Cr Income (Other Income - Inventory Adjustment)

    FIFO (Epic 19.6 / 20.4): negative adjustments consume cost layers; positive
    adjustments value additions at current FIFO average when policy is ``fifo``.
    """
    if movement.qty_delta == 0:
        return {"status": "skipped", "message": "Zero quantity movement - no GL impact"}

    settings = await get_accounting_settings(db)
    mv_date = entry_date or (movement.created_at.date() if movement.created_at else date.today())

    ext_cost = await _extended_cost_for_adjustment(db, movement=movement)

    if ext_cost <= 0:
        return {
            "status": "skipped",
            "message": "Zero-cost adjustment - no GL impact",
            "movement_id": movement.id,
        }

    if not idempotency_key:
        idempotency_key = f"stock_movement_gl:{movement.id}:{movement.reason}"

    if movement.qty_delta < 0:
        expense_acct = _negative_adjustment_expense_account_id(settings, movement.reason)
        je = await post_journal_entry(
            db,
            entry_date=mv_date,
            description=f"Inventory adjustment - {movement.reason} (mv {movement.id})",
            source_type="stock_adjustment",
            source_id=str(movement.id),
            idempotency_key=idempotency_key,
            lines=[
                {
                    "account_id": expense_acct,
                    "branch_id": movement.branch_id,
                    "debit": ext_cost,
                    "credit": Decimal("0"),
                    "memo": f"{movement.reason}: {abs(movement.qty_delta)} units",
                },
                {
                    "account_id": settings.default_inventory_account_id,
                    "branch_id": movement.branch_id,
                    "debit": Decimal("0"),
                    "credit": ext_cost,
                    "memo": "Inventory reduction",
                },
            ],
        )

        return {
            "status": "posted" if je else "duplicate",
            "journal_entry_id": je.id if je else None,
            "movement_id": movement.id,
            "amount": str(ext_cost),
            "type": "loss",
        }

    gain_account_id = int(
        settings.default_inventory_gain_account_id or settings.default_sales_revenue_account_id
    )

    je = await post_journal_entry(
        db,
        entry_date=mv_date,
        description=f"Inventory adjustment - excess found (mv {movement.id})",
        source_type="stock_adjustment",
        source_id=str(movement.id),
        idempotency_key=idempotency_key,
        lines=[
            {
                "account_id": settings.default_inventory_account_id,
                "branch_id": movement.branch_id,
                "debit": ext_cost,
                "credit": Decimal("0"),
                "memo": f"{movement.reason}: {movement.qty_delta} units",
            },
            {
                "account_id": gain_account_id,
                "branch_id": movement.branch_id,
                "debit": Decimal("0"),
                "credit": ext_cost,
                "memo": "Inventory adjustment income",
            },
        ],
    )

    return {
        "status": "posted" if je else "duplicate",
        "journal_entry_id": je.id if je else None,
        "movement_id": movement.id,
        "amount": str(ext_cost),
        "type": "gain",
    }
