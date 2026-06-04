"""Product pricing helpers."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.product_price import ProductPrice
from app.services.accounting_service import get_accounting_settings
from app.utils.money import q2


async def _resolve_currency_id(db: AsyncSession, currency_id: int | None) -> int:
    if currency_id is not None:
        return currency_id
    settings = await get_accounting_settings(db)
    return settings.base_currency_id


async def get_active_product_price(
    db: AsyncSession,
    *,
    product_id: int,
    variant_id: int | None = None,
    currency_id: int | None = None,
    as_of: datetime | None = None,
) -> ProductPrice | None:
    """Return the latest active price row for a product/variant/currency."""
    as_of = as_of or datetime.now(UTC)
    currency_id = await _resolve_currency_id(db, currency_id)

    if variant_id is not None:
        variant_res = await db.execute(
            select(ProductPrice)
            .where(
                ProductPrice.product_id == product_id,
                ProductPrice.variant_id == variant_id,
                ProductPrice.currency_id == currency_id,
                ProductPrice.valid_from <= as_of,
            )
            .order_by(desc(ProductPrice.valid_from), desc(ProductPrice.id))
            .limit(1)
        )
        variant_price = variant_res.scalar_one_or_none()
        if variant_price is not None:
            return variant_price

    result = await db.execute(
        select(ProductPrice)
        .where(
            ProductPrice.product_id == product_id,
            ProductPrice.variant_id.is_(None),
            ProductPrice.currency_id == currency_id,
            ProductPrice.valid_from <= as_of,
        )
        .order_by(desc(ProductPrice.valid_from), desc(ProductPrice.id))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_active_sell_price(
    db: AsyncSession,
    *,
    product_id: int,
    variant_id: int | None = None,
    currency_id: int | None = None,
    as_of: datetime | None = None,
) -> Decimal:
    """Return the active sell price or raise if the product is not sellable."""
    price = await get_active_product_price(
        db,
        product_id=product_id,
        variant_id=variant_id,
        currency_id=currency_id,
        as_of=as_of,
    )
    if price is None:
        raise ValidationError(
            "Product has no sellable price",
            details={"product_id": product_id, "variant_id": variant_id},
        )
    return q2(price.amount)


async def set_product_sell_price(
    db: AsyncSession,
    *,
    product_id: int,
    amount: Decimal,
    variant_id: int | None = None,
    currency_id: int | None = None,
    valid_from: datetime | None = None,
) -> ProductPrice:
    """Append a new active sell-price row when the price changes."""
    valid_from = valid_from or datetime.now(UTC)
    currency_id = await _resolve_currency_id(db, currency_id)
    normalized_amount = q2(amount)

    current = await get_active_product_price(
        db,
        product_id=product_id,
        variant_id=variant_id,
        currency_id=currency_id,
        as_of=valid_from,
    )
    if current is not None and q2(current.amount) == normalized_amount:
        return current

    price = ProductPrice(
        product_id=product_id,
        variant_id=variant_id,
        currency_id=currency_id,
        amount=normalized_amount,
        valid_from=valid_from,
    )
    db.add(price)
    await db.flush()
    return price
