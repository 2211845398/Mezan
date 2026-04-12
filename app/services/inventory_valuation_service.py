"""Weighted-average unit cost per branch/product (Epic 5.4)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch_product_costs import BranchProductCost
from app.models.product import Product


async def get_unit_cost_for_sale(
    db: AsyncSession, *, branch_id: int, product_id: int
) -> Decimal:
    """Return WAVG from branch_product_costs, else product.standard_cost, else 0."""
    res = await db.execute(
        select(BranchProductCost).where(
            and_(
                BranchProductCost.branch_id == branch_id,
                BranchProductCost.product_id == product_id,
            )
        )
    )
    row = res.scalar_one_or_none()
    if row:
        return Decimal(str(row.average_unit_cost)).quantize(Decimal("0.0001"))

    pres = await db.execute(select(Product).where(Product.id == product_id))
    product = pres.scalar_one_or_none()
    if product and product.standard_cost is not None:
        return Decimal(str(product.standard_cost)).quantize(Decimal("0.0001"))
    return Decimal("0")


async def apply_receipt_to_weighted_average(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    qty_in: int,
    unit_cost: Decimal,
    qty_on_hand_before: int,
) -> None:
    """Update rolling WAVG after a goods receipt. Call after stock is increased."""
    if qty_in <= 0:
        return

    uc = unit_cost.quantize(Decimal("0.0001"))
    qb = max(qty_on_hand_before, 0)
    res = await db.execute(
        select(BranchProductCost).where(
            and_(
                BranchProductCost.branch_id == branch_id,
                BranchProductCost.product_id == product_id,
            )
        )
    )
    row = res.scalar_one_or_none()

    prior_avg: Decimal
    if row:
        prior_avg = Decimal(str(row.average_unit_cost)).quantize(Decimal("0.0001"))
    else:
        pres = await db.execute(select(Product).where(Product.id == product_id))
        product = pres.scalar_one_or_none()
        prior_avg = (
            Decimal(str(product.standard_cost)).quantize(Decimal("0.0001"))
            if product and product.standard_cost is not None
            else Decimal("0")
        )

    denom = qb + qty_in
    if denom <= 0:
        return
    new_avg = (prior_avg * Decimal(qb) + uc * Decimal(qty_in)) / Decimal(denom)

    if row:
        row.average_unit_cost = new_avg
    else:
        db.add(
            BranchProductCost(
                branch_id=branch_id,
                product_id=product_id,
                average_unit_cost=new_avg,
            )
        )
