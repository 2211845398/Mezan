"""Read-only stock-on-hand joined view for inventory UI (W-5.3)."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.product import Product
from app.models.stock_level import StockLevel
from app.schemas.inventory_stock import StockOnHandRowRead
from app.services.inventory_valuation_service import get_unit_costs_for_sale

COST_Q = Decimal("0.0001")


def _q(value: Decimal) -> Decimal:
    return value.quantize(COST_Q)


async def list_stock_on_hand(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    category_id: int | None = None,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[StockOnHandRowRead]:
    stmt = (
        select(StockLevel, Product, Category)
        .join(Product, Product.id == StockLevel.product_id)
        .join(Category, Category.id == Product.category_id)
    )
    if branch_id is not None:
        stmt = stmt.where(StockLevel.branch_id == branch_id)
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    stmt = stmt.order_by(StockLevel.branch_id.asc(), Product.sku.asc()).limit(limit).offset(offset)
    res = await db.execute(stmt)
    rows = res.all()
    if not rows:
        return []

    by_branch: dict[int, list[tuple[StockLevel, Product, Category]]] = defaultdict(list)
    for sl, prod, cat in rows:
        by_branch[sl.branch_id].append((sl, prod, cat))

    out: list[StockOnHandRowRead] = []
    for bid, group in by_branch.items():
        pids = [p.id for _, p, _ in group]
        costs = await get_unit_costs_for_sale(db, branch_id=bid, product_ids=pids)
        for sl, prod, cat in group:
            uc = _q(costs.get(prod.id, _q(Decimal("0"))))
            oh = int(sl.on_hand)
            ext = _q(uc * Decimal(oh))
            out.append(
                StockOnHandRowRead(
                    branch_id=sl.branch_id,
                    product_id=prod.id,
                    sku=prod.sku,
                    product_name=prod.name,
                    category_id=cat.id,
                    category_name=cat.name,
                    on_hand=oh,
                    unit_cost=uc,
                    extended_cost=ext,
                )
            )
    return out
