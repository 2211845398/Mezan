"""Weighted-average unit cost per branch/product (Epic 5.4)."""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch_product_costs import BranchProductCost
from app.models.product import Product

COST_Q = Decimal("0.0001")


def _q4(value: Decimal) -> Decimal:
    return value.quantize(COST_Q)


async def get_unit_cost_for_sale(db: AsyncSession, *, branch_id: int, product_id: int) -> Decimal:
    """Return WAVG from branch_product_costs, else product.standard_cost, else 0."""
    costs = await get_unit_costs_for_sale(db, branch_id=branch_id, product_ids=[product_id])
    return costs.get(product_id, _q4(Decimal("0")))


async def get_unit_costs_for_sale(
    db: AsyncSession,
    *,
    branch_id: int,
    product_ids: Iterable[int],
) -> dict[int, Decimal]:
    """Return per-product WAVG, falling back to product.standard_cost."""
    unique_product_ids = list(dict.fromkeys(int(product_id) for product_id in product_ids))
    if not unique_product_ids:
        return {}

    cost_res = await db.execute(
        select(BranchProductCost.product_id, BranchProductCost.average_unit_cost).where(
            and_(
                BranchProductCost.branch_id == branch_id,
                BranchProductCost.product_id.in_(unique_product_ids),
            )
        )
    )
    costs = {product_id: _q4(Decimal(str(avg_cost))) for product_id, avg_cost in cost_res.all()}

    missing_product_ids = [
        product_id for product_id in unique_product_ids if product_id not in costs
    ]
    if missing_product_ids:
        product_res = await db.execute(
            select(Product.id, Product.standard_cost).where(Product.id.in_(missing_product_ids))
        )
        for product_id, standard_cost in product_res.all():
            if standard_cost is not None:
                costs[product_id] = _q4(Decimal(str(standard_cost)))
            else:
                costs[product_id] = _q4(Decimal("0"))

    for product_id in unique_product_ids:
        costs.setdefault(product_id, _q4(Decimal("0")))
    return costs


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

    uc = _q4(unit_cost)
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
        prior_avg = _q4(Decimal(str(row.average_unit_cost)))
    else:
        pres = await db.execute(select(Product).where(Product.id == product_id))
        product = pres.scalar_one_or_none()
        prior_avg = (
            _q4(Decimal(str(product.standard_cost)))
            if product and product.standard_cost is not None
            else _q4(Decimal("0"))
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
