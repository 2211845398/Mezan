"""Integration tests for relational variant attributes and sync."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.errors import ConflictError
from app.models.branch import Branch
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue
from app.models.category import Category
from app.models.category_attribute_def import CategoryAttributeDef
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.product_variant import ProductVariant
from app.models.product_variant_attribute import ProductVariantAttribute
from app.schemas.attributes import CatalogAttributeCreate, CatalogAttributeValueCreate
from app.schemas.variant_generation import VariantPreviewRequest, VariantSyncRequest, VariantSyncRow
from app.services.attribute_service import create_attribute, create_attribute_value
from app.services.catalog_service import create_product
from app.services.inventory_service import apply_stock_movement
from app.services.variant_attribute_service import preview_generate_variants, sync_product_variants


async def _leaf_category(db_session) -> Category:
    cat = Category(name="Test Cat", slug="test-cat-variant", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()
    return cat


@pytest.mark.asyncio
async def test_preview_generate_cartesian(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="color", name="Color")
    )
    size_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="size", name="Size")
    )
    red = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="red", label="Red"),
    )
    blue = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="blue", label="Blue"),
    )
    s_val = await create_attribute_value(
        db_session,
        size_attr.id,
        CatalogAttributeValueCreate(code="S", label="S"),
    )
    m_val = await create_attribute_value(
        db_session,
        size_attr.id,
        CatalogAttributeValueCreate(code="M", label="M"),
    )

    db_session.add(
        CategoryAttributeDef(
            category_id=catalog_category.id,
            key="color",
            label="Color",
            type="select",
            attribute_id=color_attr.id,
            use_for_variants=True,
            sort_order=1,
        )
    )
    db_session.add(
        CategoryAttributeDef(
            category_id=catalog_category.id,
            key="size",
            label="Size",
            type="select",
            attribute_id=size_attr.id,
            use_for_variants=True,
            sort_order=2,
        )
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Shirt",
            "sku": "SHIRT-TEST",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )

    preview = await preview_generate_variants(
        db_session,
        product_id=product.id,
        body=VariantPreviewRequest(
            axes={
                color_attr.id: [red.id, blue.id],
                size_attr.id: [s_val.id, m_val.id],
            }
        ),
    )
    assert preview.count == 4
    assert all(not row.exists for row in preview.rows)


@pytest.mark.asyncio
async def test_sync_creates_pivot_rows(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    weight = await create_attribute(
        db_session, CatalogAttributeCreate(code="weight", name="Weight")
    )
    w1 = await create_attribute_value(
        db_session,
        weight.id,
        CatalogAttributeValueCreate(code="1KG", label="1 KG"),
    )
    db_session.add(
        CategoryAttributeDef(
            category_id=catalog_category.id,
            key="weight",
            label="Weight",
            type="select",
            attribute_id=weight.id,
            use_for_variants=True,
        )
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Rice",
            "sku": "RICE-TEST",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )

    result = await sync_product_variants(
        db_session,
        product_id=product.id,
        body=VariantSyncRequest(
            variants=[
                VariantSyncRow(
                    attribute_value_ids=[w1.id],
                    sku="RICE-TEST-1KG",
                    active=True,
                )
            ]
        ),
    )
    await db_session.commit()
    assert result.created == 1

    pva = await db_session.execute(
        select(ProductVariantAttribute).join(
            ProductVariant, ProductVariant.id == ProductVariantAttribute.variant_id
        ).where(ProductVariant.product_id == product.id)
    )
    rows = pva.scalars().all()
    assert len(rows) == 1
    assert rows[0].attribute_value_id == w1.id


@pytest.mark.asyncio
async def test_preview_without_category_variant_defs(db_session) -> None:
    """Axes from global catalog only — no CategoryAttributeDef.use_for_variants."""
    catalog_category = await _leaf_category(db_session)
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="hue", name="Hue")
    )
    red = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="red", label="Red"),
    )
    blue = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="blue", label="Blue"),
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Scarf",
            "sku": "SCARF-NODEF",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )

    preview = await preview_generate_variants(
        db_session,
        product_id=product.id,
        body=VariantPreviewRequest(axes={color_attr.id: [red.id, blue.id]}),
    )
    assert preview.count == 2


@pytest.mark.asyncio
async def test_sync_rejects_deactivate_variant_with_inventory_activity(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="c2", name="Color2")
    )
    red = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="red", label="Red"),
    )
    blue = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="blue", label="Blue"),
    )
    await db_session.commit()

    branch = Branch(
        name="B1",
        code=f"b-{uuid.uuid4().hex[:6]}",
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Hat",
            "sku": "HAT-INV",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )

    sync1 = await sync_product_variants(
        db_session,
        product_id=product.id,
        body=VariantSyncRequest(
            variants=[
                VariantSyncRow(
                    attribute_value_ids=[red.id],
                    sku="HAT-INV-RED",
                    active=True,
                ),
                VariantSyncRow(
                    attribute_value_ids=[blue.id],
                    sku="HAT-INV-BLUE",
                    active=True,
                ),
            ]
        ),
    )
    await db_session.flush()
    assert sync1.created == 2

    red_res = await db_session.execute(
        select(ProductVariant).where(
            ProductVariant.product_id == product.id,
            ProductVariant.sku == "HAT-INV-RED",
        )
    )
    red_variant = red_res.scalar_one()
    red_variant_id = int(red_variant.id)
    await apply_stock_movement(
        db_session,
        idempotency_key=f"hat-sale:{red_variant_id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=-1,
        reason="sale",
        ref_type="test",
        ref_id="1",
        variant_id=red_variant_id,
    )
    await db_session.commit()

    with pytest.raises(ConflictError) as exc_info:
        await sync_product_variants(
            db_session,
            product_id=product.id,
            body=VariantSyncRequest(
                variants=[
                    VariantSyncRow(
                        attribute_value_ids=[blue.id],
                        sku="HAT-INV-BLUE",
                        active=True,
                    ),
                ]
            ),
        )
    assert "inventory activity" in exc_info.value.message.lower()
    assert exc_info.value.details is not None
    assert "display_label" in exc_info.value.details
