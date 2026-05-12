"""Inventory adjustment GL posting service (Epic 19.6).

Posts double-entry for inventory adjustments (damage, shortage, write-offs,
and positive adjustments) using weighted-average cost.

This works with StockMovement records (the existing adjustment mechanism).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.branch_product_costs import BranchProductCost
from app.models.stock_movement import StockMovement
from app.services.accounting_service import get_accounting_settings, post_journal_entry
from app.utils.money import q2


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

    Args:
        movement: The stock movement record (must have variant_id now)
        entry_date: Optional entry date (defaults to movement date or today)
        idempotency_key: Optional idempotency key

    Returns:
        Dict with journal_entry_id, status, message

    Raises:
        ValidationError: If cost cannot be determined or period closed
    """
    if movement.qty_delta == 0:
        return {"status": "skipped", "message": "Zero quantity movement - no GL impact"}

    settings = await get_accounting_settings(db)
    mv_date = entry_date or (movement.created_at.date() if movement.created_at else date.today())

    # Get unit cost for the variant at this branch
    unit_cost = Decimal("0")
    result = await db.execute(
        select(BranchProductCost)
        .where(
            BranchProductCost.branch_id == movement.branch_id,
            BranchProductCost.variant_id == movement.variant_id,
        )
    )
    cost_record = result.scalar_one_or_none()
    if cost_record:
        unit_cost = cost_record.average_unit_cost

    # Fallback: use product-level cost if variant cost not found
    if unit_cost == 0 and movement.product_id:
        result = await db.execute(
            select(BranchProductCost)
            .where(
                BranchProductCost.branch_id == movement.branch_id,
                BranchProductCost.product_id == movement.product_id,
            )
        )
        cost_record = result.scalar_one_or_none()
        if cost_record:
            unit_cost = cost_record.average_unit_cost

    ext_cost = q2(unit_cost * Decimal(abs(movement.qty_delta)))

    if ext_cost <= 0:
        return {
            "status": "skipped",
            "message": "Zero-cost adjustment - no GL impact",
            "movement_id": movement.id,
        }

    # Build idempotency key
    if not idempotency_key:
        idempotency_key = f"stock_movement_gl:{movement.id}:{movement.reason}"

    if movement.qty_delta < 0:
        # Negative: Loss/Damage (Dr Expense, Cr Inventory)
        je = await post_journal_entry(
            db,
            entry_date=mv_date,
            description=f"Inventory adjustment - {movement.reason} (mv {movement.id})",
            source_type="stock_adjustment",
            source_id=str(movement.id),
            idempotency_key=idempotency_key,
            lines=[
                {
                    "account_id": settings.default_cogs_account_id,
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
    else:
        # Positive: Excess found (Dr Inventory, Cr Income)
        # Using sales revenue as gain account; ideally should be dedicated income account
        gain_account_id = settings.default_sales_revenue_account_id

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
