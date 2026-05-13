"""FIFO cost-layer helpers (Epic 20.4; optional alongside WAVG)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.inventory_cost_layer import InventoryCostLayer
from app.services.accounting_service import get_accounting_settings
from app.utils.money import q2


async def get_valuation_policy(db: AsyncSession) -> str:
    settings = await get_accounting_settings(db)
    raw = (settings.inventory_valuation_policy or "wavg").strip().lower()
    return raw if raw in ("wavg", "fifo") else "wavg"


async def create_cost_layer(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int | None,
    source_type: str,
    source_id: str,
    qty: Decimal,
    unit_cost: Decimal,
    currency_code: str = "USD",
    fx_rate: Decimal = Decimal("1"),
) -> InventoryCostLayer:
    total = q2(qty * unit_cost)
    layer = InventoryCostLayer(
        branch_id=branch_id,
        product_id=product_id,
        variant_id=variant_id,
        source_type=source_type,
        source_id=source_id,
        received_at=datetime.now(UTC),
        original_qty=qty,
        qty_remaining=qty,
        unit_cost=unit_cost,
        total_cost=total,
        currency_code=currency_code,
        fx_rate=fx_rate,
    )
    db.add(layer)
    await db.flush()
    return layer


async def consume_layers_fifo(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int | None,
    qty_to_consume: Decimal,
) -> list[tuple[Decimal, Decimal]]:
    if qty_to_consume <= 0:
        return []

    stmt = (
        select(InventoryCostLayer)
        .where(
            InventoryCostLayer.branch_id == branch_id,
            InventoryCostLayer.product_id == product_id,
            InventoryCostLayer.qty_remaining > 0,
        )
        .order_by(InventoryCostLayer.received_at.asc())
    )
    if variant_id is not None:
        stmt = stmt.where(InventoryCostLayer.variant_id == variant_id)

    res = await db.execute(stmt)
    layers = list(res.scalars().all())
    total_available = sum((ln.qty_remaining for ln in layers), start=Decimal("0"))
    if total_available < qty_to_consume:
        raise ValidationError(
            "Insufficient cost layer quantity",
            details={"requested": str(qty_to_consume), "available": str(total_available)},
        )

    consumed: list[tuple[Decimal, Decimal]] = []
    remaining = qty_to_consume
    for layer in layers:
        if remaining <= 0:
            break
        take = min(layer.qty_remaining, remaining)
        consumed.append((take, layer.unit_cost))
        layer.qty_remaining = q2(layer.qty_remaining - take)
        remaining = q2(remaining - take)

    await db.flush()
    return consumed


async def get_fifo_unit_cost(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int | None = None,
) -> Decimal:
    layers = await get_layers_for_product(
        db, branch_id=branch_id, product_id=product_id, variant_id=variant_id
    )
    if not layers:
        return Decimal("0")
    total_cost = sum(q2(ln.qty_remaining * ln.unit_cost) for ln in layers)
    total_qty = sum(ln.qty_remaining for ln in layers)
    if total_qty <= 0:
        return Decimal("0")
    return q2(total_cost / total_qty)


async def get_layers_for_product(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int | None = None,
) -> list[InventoryCostLayer]:
    stmt = (
        select(InventoryCostLayer)
        .where(
            InventoryCostLayer.branch_id == branch_id,
            InventoryCostLayer.product_id == product_id,
            InventoryCostLayer.qty_remaining > 0,
        )
        .order_by(InventoryCostLayer.received_at.asc())
    )
    if variant_id is not None:
        stmt = stmt.where(InventoryCostLayer.variant_id == variant_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())
