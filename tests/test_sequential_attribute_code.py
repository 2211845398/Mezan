"""Tests for sequential ATTR_n / VAL_n allocation."""

import pytest

from app.schemas.attributes import CatalogAttributeCreate, CatalogAttributeValueCreate
from app.services.attribute_service import create_attribute, create_attribute_value


@pytest.mark.asyncio
async def test_next_val_codes_per_attribute(db_session) -> None:
    attr = await create_attribute(
        db_session, CatalogAttributeCreate(code="size", name="Size")
    )
    v1 = await create_attribute_value(
        db_session,
        attr.id,
        CatalogAttributeValueCreate(label="كبير"),
    )
    v2 = await create_attribute_value(
        db_session,
        attr.id,
        CatalogAttributeValueCreate(label="صغير"),
    )
    assert v1.code == "VAL_1"
    assert v2.code == "VAL_2"
