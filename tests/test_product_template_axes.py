"""Product template attribute lines and variant configuration sync."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.category import Category
from app.models.product_attribute_line import ProductAttributeLine
from app.models.product_attribute_line_value import ProductAttributeLineValue
from app.models.product_variant import ProductVariant
from app.schemas.attributes import CatalogAttributeCreate, CatalogAttributeValueCreate
from app.schemas.variant_generation import VariantSyncRequest, VariantSyncRow
from app.services.attribute_service import create_attribute, create_attribute_value, merge_attribute_values
from app.schemas.attributes import CatalogAttributeValueMergeRequest
from app.services.catalog_service import create_product
from app.services.variant_attribute_service import (
    load_product_attribute_axes,
    sync_product_variant_configuration,
)


async def _leaf_category(db_session) -> Category:
    cat = Category(name="Tpl Cat", slug="tpl-cat", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()
    return cat


@pytest.mark.asyncio
async def test_sync_persists_template_axes_and_price_extra(db_session) -> None:
    cat = await _leaf_category(db_session)
    color = await create_attribute(db_session, CatalogAttributeCreate(code="color", name="Color"))
    size = await create_attribute(db_session, CatalogAttributeCreate(code="size", name="Size"))
    red = await create_attribute_value(
        db_session, color.id, CatalogAttributeValueCreate(code="red", label="Red")
    )
    blue = await create_attribute_value(
        db_session, color.id, CatalogAttributeValueCreate(code="blue", label="Blue")
    )
    large = await create_attribute_value(
        db_session, size.id, CatalogAttributeValueCreate(code="L", label="L")
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Shirt",
            "sku": "SHIRT-TPL",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )

    axes = {color.id: [red.id, blue.id], size.id: [large.id]}
    result = await sync_product_variant_configuration(
        db_session,
        product_id=product.id,
        body=VariantSyncRequest(
            axes=axes,
            variants=[
                VariantSyncRow(
                    attribute_value_ids=[red.id, large.id],
                    sku="SHIRT-TPL-RED-L",
                    active=True,
                    price_extra="5.00",
                ),
                VariantSyncRow(
                    attribute_value_ids=[blue.id, large.id],
                    sku="SHIRT-TPL-BLUE-L",
                    active=True,
                    price_extra="0",
                ),
            ],
        ),
    )
    await db_session.commit()
    assert result.created == 2

    saved_axes = await load_product_attribute_axes(db_session, product.id)
    assert len(saved_axes) == 2
    assert set(saved_axes[0].value_ids + saved_axes[1].value_ids) == {red.id, blue.id, large.id}

    line_count = await db_session.execute(
        select(ProductAttributeLine).where(ProductAttributeLine.product_id == product.id)
    )
    assert len(line_count.scalars().all()) == 2

    val_count = await db_session.execute(
        select(ProductAttributeLineValue)
        .join(ProductAttributeLine, ProductAttributeLine.id == ProductAttributeLineValue.line_id)
        .where(ProductAttributeLine.product_id == product.id)
    )
    assert len(val_count.scalars().all()) == 3

    pv_res = await db_session.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id)
    )
    variants = {v.sku: v for v in pv_res.scalars().all()}
    from decimal import Decimal

    assert variants["SHIRT-TPL-RED-L"].price_extra == Decimal("5.0000")
    assert variants["SHIRT-TPL-RED-L"].combination_key == f"{red.id},{large.id}"


@pytest.mark.asyncio
async def test_duplicate_combination_in_request_rejected(db_session) -> None:
    cat = await _leaf_category(db_session)
    color = await create_attribute(db_session, CatalogAttributeCreate(code="c", name="C"))
    red = await create_attribute_value(
        db_session, color.id, CatalogAttributeValueCreate(code="red", label="Red")
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Mug",
            "sku": "MUG-1",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )

    with pytest.raises(ValidationError):
        await sync_product_variant_configuration(
            db_session,
            product_id=product.id,
            body=VariantSyncRequest(
                axes={color.id: [red.id]},
                variants=[
                    VariantSyncRow(attribute_value_ids=[red.id], sku="MUG-1-RED-A", active=True),
                    VariantSyncRow(attribute_value_ids=[red.id], sku="MUG-1-RED-B", active=True),
                ],
            ),
        )


@pytest.mark.asyncio
async def test_merge_attribute_values_repoints_template_lines(db_session) -> None:
    cat = await _leaf_category(db_session)
    size = await create_attribute(db_session, CatalogAttributeCreate(code="size", name="Size"))
    xl = await create_attribute_value(
        db_session, size.id, CatalogAttributeValueCreate(code="XL", label="XL")
    )
    xl_dup = await create_attribute_value(
        db_session, size.id, CatalogAttributeValueCreate(code="XL2", label="xl")
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Pants",
            "sku": "PANTS-1",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )
    await sync_product_variant_configuration(
        db_session,
        product_id=product.id,
        body=VariantSyncRequest(
            axes={size.id: [xl.id, xl_dup.id]},
            variants=[
                VariantSyncRow(attribute_value_ids=[xl.id], sku="PANTS-XL", active=True),
                VariantSyncRow(attribute_value_ids=[xl_dup.id], sku="PANTS-xl", active=True),
            ],
        ),
    )
    await db_session.commit()

    await merge_attribute_values(
        db_session,
        size.id,
        CatalogAttributeValueMergeRequest(target_value_id=xl.id, source_value_ids=[xl_dup.id]),
    )
    await db_session.commit()

    saved = await load_product_attribute_axes(db_session, product.id)
    assert xl_dup.id not in saved[0].value_ids
    assert xl.id in saved[0].value_ids
