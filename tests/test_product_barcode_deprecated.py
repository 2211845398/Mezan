"""Product-level barcode is ignored; variants own barcodes."""

import pytest
from sqlalchemy import select

from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.services.catalog_service import create_product


@pytest.mark.asyncio
async def test_create_product_ignores_barcode_and_leaves_product_null(db_session) -> None:
    cat = Category(name="BC Cat", slug="bc-cat-dep", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "No Product Barcode",
            "sku": "NPB-001",
            "barcode": "2019999999999",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await db_session.commit()

    res = await db_session.execute(select(Product).where(Product.id == product.id))
    p = res.scalar_one()
    assert p.barcode is None

    vres = await db_session.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id)
    )
    pv = vres.scalars().first()
    assert pv is not None
    assert pv.barcode is not None
