"""Integration tests for relational variant attributes and sync."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.errors import ConflictError, ValidationError
from app.models.branch import Branch
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue
from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.product_variant_attribute import ProductVariantAttribute
from app.schemas.attributes import (
    CatalogAttributeCreate,
    CatalogAttributeUpdate,
    CatalogAttributeValueCreate,
    CatalogAttributeValueUpdate,
)
from app.schemas.variant_generation import VariantPreviewRequest, VariantSyncRequest, VariantSyncRow
from app.services.attribute_service import (
    create_attribute,
    create_attribute_value,
    update_attribute,
    update_attribute_value,
)
from app.services.catalog_service import create_product, search_product_variants_for_purchasing
from app.services.purchase_order_service import validate_variant_belongs_to_product
from app.services.inventory_service import apply_stock_movement
from app.services.variant_attribute_service import (
    preview_generate_variants,
    sync_product_attribute_lines,
    sync_product_variants,
)


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

    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Shirt",
            "sku": "SHIRT-TEST",
            "status": "active",
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
    skus = {row.suggested_sku for row in preview.rows}
    assert "SHIRT-TEST-RED-S" in skus
    assert all("—" not in s for s in skus)
    assert all(s == s.upper() for s in skus)


@pytest.mark.asyncio
async def test_create_attribute_value_assigns_val_for_arabic_label(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="color", name="Color")
    )
    red = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(label="أحمر"),
    )
    assert red.code == "VAL_1"
    green = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(label="أخضر"),
    )
    assert green.code == "VAL_2"


@pytest.mark.asyncio
async def test_create_attribute_assigns_attr_for_arabic_name(db_session) -> None:
    await _leaf_category(db_session)
    a1 = await create_attribute(db_session, CatalogAttributeCreate(name="لون"))
    assert a1.code == "ATTR_1"
    a2 = await create_attribute(db_session, CatalogAttributeCreate(name="مقاس"))
    assert a2.code == "ATTR_2"


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
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Rice",
            "sku": "RICE-TEST",
            "status": "active",
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
    """Axes come from the global catalog without category-bound definitions."""
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


@pytest.mark.asyncio
async def test_create_attribute_value_rejects_sku_segment_collision(db_session) -> None:
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="color2", name="Color 2")
    )
    await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="BLACK", label="Black"),
    )
    with pytest.raises(ValidationError) as exc_info:
        await create_attribute_value(
            db_session,
            color_attr.id,
            CatalogAttributeValueCreate(code="BLACKBERRY", label="Blackberry"),
        )
    assert exc_info.value.details is not None
    assert exc_info.value.details.get("code") == "sku_segment_collision"


@pytest.mark.asyncio
async def test_update_value_code_when_unused(db_session) -> None:
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="color3", name="Color 3")
    )
    val = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="CLLOR", label="Color typo"),
    )
    updated = await update_attribute_value(
        db_session,
        color_attr.id,
        val.id,
        CatalogAttributeValueUpdate(code="COLOR"),
    )
    assert updated.code == "COLOR"


@pytest.mark.asyncio
async def test_update_value_code_locked_when_on_product_line(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="color4", name="Color 4")
    )
    red = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="red", label="Red"),
    )
    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Locked Code Shirt",
            "sku": "LOCK-SHIRT",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await sync_product_attribute_lines(
        db_session,
        product_id=product.id,
        axes={color_attr.id: [red.id]},
    )
    await db_session.commit()

    with pytest.raises(ConflictError) as exc_info:
        await update_attribute_value(
            db_session,
            color_attr.id,
            red.id,
            CatalogAttributeValueUpdate(code="RED2"),
        )
    assert exc_info.value.details is not None
    assert exc_info.value.details.get("code") == "code_locked"


@pytest.mark.asyncio
async def test_update_attribute_code_locked_after_product_line(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    size_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="size5", name="Size 5")
    )
    s_val = await create_attribute_value(
        db_session,
        size_attr.id,
        CatalogAttributeValueCreate(code="S", label="S"),
    )
    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Locked Axis Shirt",
            "sku": "LOCK-AXIS",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await sync_product_attribute_lines(
        db_session,
        product_id=product.id,
        axes={size_attr.id: [s_val.id]},
    )
    await db_session.commit()

    with pytest.raises(ConflictError) as exc_info:
        await update_attribute(
            db_session,
            size_attr.id,
            CatalogAttributeUpdate(code="SIZE5"),
        )
    assert exc_info.value.details is not None
    assert exc_info.value.details.get("code") == "code_locked"


@pytest.mark.asyncio
async def test_update_product_ignores_removed_attributes_payload(
    db_session,
) -> None:
    """Legacy attributes payloads are ignored after removing products.attributes."""
    from app.services.catalog_service import update_product

    catalog_category = await _leaf_category(db_session)
    length_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="length", name="Length")
    )
    val = await create_attribute_value(
        db_session,
        length_attr.id,
        CatalogAttributeValueCreate(code="1M", label="1m"),
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Length Product",
            "sku": "LEN-TEST",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await sync_product_attribute_lines(
        db_session,
        product_id=product.id,
        axes={length_attr.id: [val.id]},
    )
    await db_session.commit()

    updated = await update_product(
        db_session,
        product_id=product.id,
        data={"attributes": {}},
    )
    assert updated.id == product.id


@pytest.mark.asyncio
async def test_search_by_product_id_returns_active_variants_only(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="c_search", name="Color Search")
    )
    red = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="RED", label="Red"),
    )
    blue = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="BLUE", label="Blue"),
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Search Polo",
            "sku": "POLO-SRCH",
            "status": "active",
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
                    sku="POLO-SRCH-RED",
                    active=True,
                ),
                VariantSyncRow(
                    attribute_value_ids=[blue.id],
                    sku="POLO-SRCH-BLUE",
                    active=True,
                ),
            ]
        ),
    )
    await db_session.commit()
    assert sync1.created == 2

    blue_variant = (
        await db_session.execute(
            select(ProductVariant).where(ProductVariant.sku == "POLO-SRCH-BLUE")
        )
    ).scalar_one()
    blue_variant.active = False
    await db_session.commit()

    hits = await search_product_variants_for_purchasing(
        db_session, q=None, product_id=product.id, limit=50
    )
    assert len(hits) == 1
    assert hits[0].sku == "POLO-SRCH-RED"

    with pytest.raises(ValidationError) as exc_info:
        await validate_variant_belongs_to_product(
            db_session,
            product_id=product.id,
            variant_id=int(blue_variant.id),
        )
    assert "archived" in str(exc_info.value).lower() or "inactive" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_sync_same_payload_twice_is_idempotent(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    color_attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="c_idem", name="Color Idem")
    )
    red = await create_attribute_value(
        db_session,
        color_attr.id,
        CatalogAttributeValueCreate(code="RED", label="Red"),
    )
    await db_session.commit()

    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Idem Shirt",
            "sku": "IDEM-TEST",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    body = VariantSyncRequest(
        variants=[
            VariantSyncRow(
                attribute_value_ids=[red.id],
                sku="IDEM-TEST-RED",
                active=True,
            )
        ]
    )
    first = await sync_product_variants(db_session, product_id=product.id, body=body)
    await db_session.commit()
    assert first.created == 1

    second = await sync_product_variants(db_session, product_id=product.id, body=body)
    await db_session.commit()
    assert second.created == 0
    assert second.updated == 1

    count_res = await db_session.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id)
    )
    assert len(count_res.scalars().all()) == 1
