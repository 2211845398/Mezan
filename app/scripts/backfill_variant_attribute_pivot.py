"""Backfill product_variant_attributes from product_variants.attribute_values JSONB.

Run: uv run python -m app.scripts.backfill_variant_attribute_pivot
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue
from app.models.product_variant import ProductVariant
from app.models.product_variant_attribute import ProductVariantAttribute
from app.utils.attribute_code import normalize_attribute_code

logger = logging.getLogger(__name__)


async def get_or_create_attribute(
    session: AsyncSession, *, key: str
) -> CatalogAttribute:
    code = normalize_attribute_code(key) or key[:64].upper()
    res = await session.execute(select(CatalogAttribute).where(CatalogAttribute.code == code))
    row = res.scalar_one_or_none()
    if row:
        return row
    row = CatalogAttribute(code=code, name=key, sort_order=0)
    session.add(row)
    await session.flush()
    return row


async def get_or_create_value(
    session: AsyncSession,
    *,
    attribute_id: int,
    label: str,
) -> CatalogAttributeValue:
    code = normalize_attribute_code(label) or normalize_attribute_code(str(label))
    res = await session.execute(
        select(CatalogAttributeValue).where(
            CatalogAttributeValue.attribute_id == attribute_id,
            CatalogAttributeValue.code == code,
        )
    )
    row = res.scalar_one_or_none()
    if row:
        return row
    row = CatalogAttributeValue(
        attribute_id=attribute_id,
        code=code,
        label=str(label),
        sort_order=0,
    )
    session.add(row)
    await session.flush()
    return row


async def backfill_pivot(session: AsyncSession) -> dict[str, Any]:
    stats = {
        "variants_seen": 0,
        "pivot_rows_created": 0,
        "skipped_default": 0,
        "skipped_empty": 0,
    }
    res = await session.execute(select(ProductVariant))
    variants = res.scalars().all()
    for pv in variants:
        stats["variants_seen"] += 1
        attrs = pv.attribute_values if isinstance(pv.attribute_values, dict) else {}
        if attrs.get("_default"):
            stats["skipped_default"] += 1
            continue
        if not attrs:
            stats["skipped_empty"] += 1
            continue
        existing = await session.execute(
            select(ProductVariantAttribute.id).where(
                ProductVariantAttribute.variant_id == pv.id
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            continue
        for key, raw_val in attrs.items():
            if key.startswith("_"):
                continue
            if raw_val is None:
                continue
            label = str(raw_val)
            attr = await get_or_create_attribute(session, key=str(key))
            val = await get_or_create_value(session, attribute_id=attr.id, label=label)
            session.add(
                ProductVariantAttribute(
                    variant_id=pv.id,
                    attribute_id=attr.id,
                    attribute_value_id=val.id,
                )
            )
            stats["pivot_rows_created"] += 1
    await session.commit()
    return stats


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    engine = create_async_engine(settings.database_url, future=True)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        stats = await backfill_pivot(session)
    logger.info("Backfill complete: %s", stats)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
