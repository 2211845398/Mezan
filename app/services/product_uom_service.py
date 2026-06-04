"""Product unit-of-measure helpers for purchasing and inventory."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.product import Product
from app.models.product_unit_conversion import ProductUnitConversion
from app.models.unit_of_measure import UnitOfMeasure

_COST_Q = Decimal("0.0001")


def _q4(value: Decimal) -> Decimal:
    return value.quantize(_COST_Q, rounding=ROUND_HALF_UP)


async def get_product_base_uom_id(db: AsyncSession, product_id: int) -> int:
    res = await db.execute(select(Product.uom_id).where(Product.id == int(product_id)).limit(1))
    base_id = res.scalar_one_or_none()
    if base_id is None:
        raise ValidationError("Product not found", details={"product_id": product_id})
    return int(base_id)


async def get_allowed_uom_ids_for_product(db: AsyncSession, product_id: int) -> set[int]:
    base_id = await get_product_base_uom_id(db, product_id)
    res = await db.execute(
        select(ProductUnitConversion.uom_id).where(
            ProductUnitConversion.product_id == int(product_id)
        )
    )
    alt_ids = {int(row[0]) for row in res.all()}
    return {base_id, *alt_ids}


async def validate_po_line_uom(db: AsyncSession, *, product_id: int, uom_id: int) -> None:
    allowed = await get_allowed_uom_ids_for_product(db, product_id)
    if int(uom_id) not in allowed:
        raise ValidationError(
            "Unit of measure is not configured for this product",
            details={
                "product_id": product_id,
                "uom_id": uom_id,
                "allowed_uom_ids": sorted(allowed),
            },
        )


async def convert_product_qty_to_base(
    db: AsyncSession, *, product_id: int, uom_id: int, qty: int
) -> int:
    if qty <= 0:
        raise ValidationError("qty must be positive", details={"qty": qty})
    await validate_po_line_uom(db, product_id=product_id, uom_id=uom_id)
    base_id = await get_product_base_uom_id(db, product_id)
    if int(uom_id) == base_id:
        return int(qty)
    res = await db.execute(
        select(ProductUnitConversion.factor_to_base).where(
            ProductUnitConversion.product_id == int(product_id),
            ProductUnitConversion.uom_id == int(uom_id),
        )
    )
    factor = res.scalar_one_or_none()
    if factor is None:
        raise ValidationError(
            "Missing conversion factor for product unit",
            details={"product_id": product_id, "uom_id": uom_id},
        )
    base_qty = int(Decimal(str(factor)) * int(qty))
    if base_qty <= 0:
        raise ValidationError(
            "Converted base quantity must be positive",
            details={"product_id": product_id, "uom_id": uom_id, "qty": qty},
        )
    return base_qty


async def convert_product_unit_cost_to_base(
    db: AsyncSession,
    *,
    product_id: int,
    uom_id: int,
    unit_cost: Decimal,
) -> Decimal:
    """Convert a per-line-UoM unit cost to cost per base unit (for WAVG / FIFO)."""
    if unit_cost <= 0:
        raise ValidationError("unit_cost must be positive", details={"unit_cost": str(unit_cost)})
    await validate_po_line_uom(db, product_id=product_id, uom_id=uom_id)
    base_id = await get_product_base_uom_id(db, product_id)
    if int(uom_id) == base_id:
        return _q4(unit_cost)
    res = await db.execute(
        select(ProductUnitConversion.factor_to_base).where(
            ProductUnitConversion.product_id == int(product_id),
            ProductUnitConversion.uom_id == int(uom_id),
        )
    )
    factor = res.scalar_one_or_none()
    if factor is None:
        raise ValidationError(
            "Missing conversion factor for product unit",
            details={"product_id": product_id, "uom_id": uom_id},
        )
    factor_d = Decimal(str(factor))
    if factor_d <= 0:
        raise ValidationError(
            "Conversion factor must be positive",
            details={"product_id": product_id, "uom_id": uom_id, "factor": str(factor)},
        )
    return _q4(unit_cost / factor_d)


async def uom_map_for_ids(db: AsyncSession, uom_ids: set[int]) -> dict[int, UnitOfMeasure]:
    if not uom_ids:
        return {}
    res = await db.execute(select(UnitOfMeasure).where(UnitOfMeasure.id.in_(uom_ids)))
    return {int(r.id): r for r in res.scalars().all()}


async def get_uom_factor_to_base(db: AsyncSession, *, product_id: int, uom_id: int) -> Decimal:
    """Return how many base units one unit of ``uom_id`` represents."""
    await validate_po_line_uom(db, product_id=product_id, uom_id=uom_id)
    base_id = await get_product_base_uom_id(db, product_id)
    if int(uom_id) == base_id:
        return Decimal("1")
    res = await db.execute(
        select(ProductUnitConversion.factor_to_base).where(
            ProductUnitConversion.product_id == int(product_id),
            ProductUnitConversion.uom_id == int(uom_id),
        )
    )
    factor = res.scalar_one_or_none()
    if factor is None:
        raise ValidationError(
            "Missing conversion factor for product unit",
            details={"product_id": product_id, "uom_id": uom_id},
        )
    return Decimal(str(factor))


async def list_product_uom_options(
    db: AsyncSession, *, product_id: int
) -> list[dict[str, object]]:
    """Return base + alternative UoM options for POS/catalog UI."""
    base_id = await get_product_base_uom_id(db, product_id)
    uom_ids = await get_allowed_uom_ids_for_product(db, product_id)
    umap = await uom_map_for_ids(db, uom_ids)
    conv_res = await db.execute(
        select(ProductUnitConversion).where(ProductUnitConversion.product_id == int(product_id))
    )
    factors = {int(c.uom_id): Decimal(str(c.factor_to_base)) for c in conv_res.scalars().all()}
    options: list[dict[str, object]] = []
    for uid in sorted(uom_ids, key=lambda x: (x != base_id, x)):
        uom = umap.get(uid)
        if uom is None:
            continue
        factor = Decimal("1") if uid == base_id else factors.get(uid, Decimal("1"))
        options.append(
            {
                "uom_id": uid,
                "code": uom.code,
                "symbol": uom.symbol,
                "name": uom.name,
                "factor_to_base": str(factor),
                "is_base": uid == base_id,
            }
        )
    return options
