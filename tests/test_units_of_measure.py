"""Units of measure on products."""

import pytest
from sqlalchemy import select

from app.models.category import Category
from app.models.unit_of_measure import UnitOfMeasure
from app.services.catalog_service import (
    create_product,
    list_units_of_measure,
    product_to_read,
    resolve_product_uom_id,
)


@pytest.mark.asyncio
async def test_list_units_of_measure_seeded(db_session) -> None:
    uoms = await list_units_of_measure(db_session)
    codes = {u.code for u in uoms}
    assert "PIECE" in codes
    assert "KG" in codes
    piece = next(u for u in uoms if u.code == "PIECE")
    kg = next(u for u in uoms if u.code == "KG")
    assert piece.measurement_category == "discrete"
    assert kg.measurement_category == "weight"


@pytest.mark.asyncio
async def test_create_product_defaults_to_piece_uom(db_session) -> None:
    cat = Category(name="UOM Cat", slug="uom-cat-test", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    piece_id = await resolve_product_uom_id(db_session, None)
    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Rope",
            "sku": "ROPE-001",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await db_session.commit()

    assert product.uom_id == piece_id

    read = await product_to_read(db_session, product)
    assert read.uom_symbol == "pcs"
    assert read.has_variants is False


@pytest.mark.asyncio
async def test_create_product_with_meter_uom(db_session) -> None:
    cat = Category(name="UOM Cat2", slug="uom-cat2-test", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    res = await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "METER"))
    meter = res.scalar_one()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Cable",
            "sku": "CBL-001",
            "uom_id": meter.id,
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await db_session.commit()

    read = await product_to_read(db_session, product)
    assert read.uom_symbol == "m"
    assert read.uom_name == "Meter"
