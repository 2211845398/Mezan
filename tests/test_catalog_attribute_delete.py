"""Tests for catalog attribute / value delete guards when linked to products."""

from __future__ import annotations

import pytest

from app.core.errors import ConflictError
from app.models.category import Category
from app.schemas.attributes import CatalogAttributeCreate, CatalogAttributeValueCreate
from app.services.attribute_service import (
    create_attribute,
    create_attribute_value,
    delete_attribute,
    delete_attribute_value,
)
from app.services.catalog_service import create_product
from app.services.variant_attribute_service import sync_product_attribute_lines


async def _leaf_category(db_session) -> Category:
    cat = Category(name="Del Attr Cat", slug="del-attr-cat", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()
    return cat


async def _attribute_with_value(
    db_session, *, code: str, name: str, value_code: str, value_label: str
):
    attr = await create_attribute(db_session, CatalogAttributeCreate(code=code, name=name))
    val = await create_attribute_value(
        db_session,
        attr.id,
        CatalogAttributeValueCreate(code=value_code, label=value_label),
    )
    return attr, val


@pytest.mark.asyncio
async def test_delete_attribute_value_blocked_when_on_product(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    color_attr, red = await _attribute_with_value(
        db_session, code="del_color", name="Color", value_code="red", value_label="Red"
    )
    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Delete Value Shirt",
            "sku": "DEL-VAL-SHIRT",
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
        await delete_attribute_value(db_session, color_attr.id, red.id)
    assert exc_info.value.details is not None
    assert exc_info.value.details.get("code") == "catalog_attribute_value_in_use"


@pytest.mark.asyncio
async def test_delete_attribute_blocked_when_axis_on_product(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    size_attr, s_val = await _attribute_with_value(
        db_session, code="del_size", name="Size", value_code="S", value_label="S"
    )
    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Delete Attr Shirt",
            "sku": "DEL-ATTR-SHIRT",
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
        await delete_attribute(db_session, size_attr.id)
    assert exc_info.value.details is not None
    assert exc_info.value.details.get("code") == "catalog_attribute_in_use"


@pytest.mark.asyncio
async def test_delete_attribute_value_succeeds_when_unused(db_session) -> None:
    color_attr, red = await _attribute_with_value(
        db_session, code="free_color", name="Free Color", value_code="red", value_label="Red"
    )
    await db_session.commit()

    await delete_attribute_value(db_session, color_attr.id, red.id)
    await db_session.commit()


@pytest.mark.asyncio
async def test_delete_attribute_succeeds_when_unused(db_session) -> None:
    size_attr, _ = await _attribute_with_value(
        db_session, code="free_size", name="Free Size", value_code="M", value_label="M"
    )
    await db_session.commit()

    await delete_attribute(db_session, size_attr.id)
    await db_session.commit()
