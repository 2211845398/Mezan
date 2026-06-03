"""Product alternative units of measure with conversion factors."""

import pytest
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.category import Category
from app.models.product_unit_conversion import ProductUnitConversion
from app.models.unit_of_measure import UnitOfMeasure
from app.services.catalog_service import create_product, product_to_read, update_product


@pytest.mark.asyncio
async def test_create_product_with_box_alternative(db_session) -> None:
    cat = Category(name="UOM Alt Cat", slug="uom-alt-cat", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    piece = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
    ).scalar_one()
    box = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "BOX"))
    ).scalar_one()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Bottled Water",
            "sku": "BW-001",
            "status": "active",
            "output_vat_rate": "0",
            "uom_id": piece.id,
            "alternative_uoms": [{"uom_id": box.id, "factor_to_base": "12"}],
        },
    )
    await db_session.commit()

    read = await product_to_read(db_session, product)
    assert read.uom_id == piece.id
    assert len(read.alternative_uoms) == 1
    assert read.alternative_uoms[0].uom_code == "BOX"
    assert read.alternative_uoms[0].factor_to_base == 12

    res = await db_session.execute(
        select(ProductUnitConversion).where(ProductUnitConversion.product_id == product.id)
    )
    rows = list(res.scalars().all())
    assert len(rows) == 1
    assert int(rows[0].uom_id) == box.id


@pytest.mark.asyncio
async def test_reject_alternative_uom_different_category(db_session) -> None:
    cat = Category(name="UOM Cat X", slug="uom-cat-x", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    piece = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
    ).scalar_one()
    kg = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "KG"))
    ).scalar_one()

    with pytest.raises(ValidationError, match="measurement category"):
        await create_product(
            db_session,
            data={
                "category_id": cat.id,
                "name": "Mixed",
                "sku": "MIX-001",
                "status": "active",
                "output_vat_rate": "0",
                "uom_id": piece.id,
                "alternative_uoms": [{"uom_id": kg.id, "factor_to_base": "1"}],
            },
        )


@pytest.mark.asyncio
async def test_update_product_replaces_alternative_uoms(db_session) -> None:
    cat = Category(name="UOM Cat Y", slug="uom-cat-y", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    piece = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
    ).scalar_one()
    box = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "BOX"))
    ).scalar_one()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Snack",
            "sku": "SNK-001",
            "status": "active",
            "output_vat_rate": "0",
            "uom_id": piece.id,
            "alternative_uoms": [{"uom_id": box.id, "factor_to_base": "6"}],
        },
    )
    await db_session.commit()

    await update_product(
        db_session,
        product_id=product.id,
        data={"alternative_uoms": []},
    )
    await db_session.commit()

    read = await product_to_read(db_session, product)
    assert read.alternative_uoms == []
