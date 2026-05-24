"""Product variant search for purchasing/transfers — no barcode filter."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.services.catalog_service import create_product, search_product_variants_for_purchasing


@pytest.mark.asyncio
async def test_variant_search_does_not_match_barcode_only(db_session) -> None:
    cat = Category(name="Search Cat", slug=f"sc-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Unique Search Product",
            "sku": f"USP-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    unique_barcode = f"BCONLY{uuid.uuid4().hex[:10]}"
    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V1",
        barcode=unique_barcode,
        reference_code=None,
        attribute_values={},
        active=True,
    )
    db_session.add(variant)
    await db_session.commit()

    hits = await search_product_variants_for_purchasing(db_session, q=unique_barcode, limit=50)
    ids = {h.variant_id for h in hits}
    assert int(variant.id) not in ids


@pytest.mark.asyncio
async def test_variant_search_matches_reference_code(db_session) -> None:
    cat = Category(name="Ref Cat", slug=f"rc-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Ref Product",
            "sku": f"REF-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    ref = f"CUST-{uuid.uuid4().hex[:6].upper()}"
    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V1",
        barcode=None,
        reference_code=ref,
        attribute_values={"color": "red"},
        active=True,
    )
    db_session.add(variant)
    await db_session.commit()

    hits = await search_product_variants_for_purchasing(db_session, q=ref, limit=50)
    assert any(h.variant_id == int(variant.id) for h in hits)

    res = await db_session.execute(select(ProductVariant).where(ProductVariant.id == variant.id))
    assert res.scalar_one().reference_code == ref


@pytest.mark.asyncio
async def test_variant_search_matches_product_name(db_session) -> None:
    cat = Category(name="Name Cat", slug=f"nc-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Arabic Wardrobe Special",
            "sku": f"AW-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V1",
        barcode=None,
        reference_code=None,
        attribute_values={"len": "1m"},
        active=True,
    )
    db_session.add(variant)
    await db_session.commit()

    hits = await search_product_variants_for_purchasing(db_session, q="Wardrobe", limit=50)
    assert any(h.variant_id == int(variant.id) for h in hits)


@pytest.mark.asyncio
async def test_variant_search_does_not_match_variant_sku_only(db_session) -> None:
    cat = Category(name="Sku Cat", slug=f"sk-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Hidden Product Name XYZ",
            "sku": f"HP-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    unique_variant_sku = f"VSKU-{uuid.uuid4().hex[:10]}"
    variant = ProductVariant(
        product_id=product.id,
        sku=unique_variant_sku,
        barcode=None,
        reference_code=None,
        attribute_values={},
        active=True,
    )
    db_session.add(variant)
    await db_session.commit()

    hits = await search_product_variants_for_purchasing(db_session, q=unique_variant_sku, limit=50)
    ids = {h.variant_id for h in hits}
    assert int(variant.id) not in ids
