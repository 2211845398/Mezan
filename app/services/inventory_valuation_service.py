"""Weighted-average unit cost per branch/product (Epic 5.4)."""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch_product_costs import BranchProductCost
from app.models.product import Product
from app.services.catalog_service import resolve_default_variant_id
from app.services.fifo_valuation_service import get_fifo_unit_cost, get_valuation_policy

COST_Q = Decimal("0.0001")


def _q4(value: Decimal) -> Decimal:
    return value.quantize(COST_Q)


async def get_unit_cost_for_sale(
    db: AsyncSession, *, branch_id: int, product_id: int, variant_id: int | None = None
) -> Decimal:
    """Return WAVG from branch_product_costs, else product.standard_cost, else 0."""
    vid = (
        variant_id
        if variant_id is not None
        else await resolve_default_variant_id(db, product_id=product_id)
    )
    if await get_valuation_policy(db) == "fifo":
        return _q4(
            await get_fifo_unit_cost(
                db, branch_id=branch_id, product_id=product_id, variant_id=vid
            )
        )
    cost_res = await db.execute(
        select(BranchProductCost.average_unit_cost).where(
            and_(
                BranchProductCost.branch_id == branch_id,
                BranchProductCost.product_id == product_id,
                BranchProductCost.variant_id == vid,
            )
        )
    )
    row_avg = cost_res.scalar_one_or_none()
    if row_avg is not None:
        return _q4(Decimal(str(row_avg)))

    product_res = await db.execute(select(Product.standard_cost).where(Product.id == product_id))
    sc = product_res.scalar_one_or_none()
    if sc is not None:
        return _q4(Decimal(str(sc)))
    return _q4(Decimal("0"))


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

    costs: dict[int, Decimal] = {}
    for pid in unique_product_ids:
        vid = await resolve_default_variant_id(db, product_id=pid)
        cost_res = await db.execute(
            select(BranchProductCost.average_unit_cost).where(
                and_(
                    BranchProductCost.branch_id == branch_id,
                    BranchProductCost.product_id == pid,
                    BranchProductCost.variant_id == vid,
                )
            )
        )
        row_avg = cost_res.scalar_one_or_none()
        if row_avg is not None:
            costs[pid] = _q4(Decimal(str(row_avg)))

    missing_product_ids = [product_id for product_id in unique_product_ids if product_id not in costs]
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
    variant_id: int | None = None,
) -> None:
    """Update rolling WAVG after a goods receipt. Call after stock is increased."""
    if qty_in <= 0:
        return

    uc = _q4(unit_cost)
    qb = max(qty_on_hand_before, 0)
    resolved_variant_id = (
        variant_id
        if variant_id is not None
        else await resolve_default_variant_id(db, product_id=product_id)
    )
    res = await db.execute(
        select(BranchProductCost).where(
            and_(
                BranchProductCost.branch_id == branch_id,
                BranchProductCost.product_id == product_id,
                BranchProductCost.variant_id == resolved_variant_id,
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
                variant_id=resolved_variant_id,
                average_unit_cost=new_avg,
            )
        )
