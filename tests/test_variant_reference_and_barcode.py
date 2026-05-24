"""Variant reference_code, system SKU, and barcode generation."""

import pytest
from sqlalchemy import select

from app.models.category import Category
from app.models.product_variant import ProductVariant
from app.schemas.variant_generation import VariantSyncRequest, VariantSyncRow
from app.services.catalog_service import (
    _make_internal_ean13_from_variant_id,
    create_product,
)
from app.services.variant_attribute_service import (
    export_variant_barcodes_csv,
    generate_missing_variant_barcodes,
    sync_product_variants,
)


async def _leaf_category(db_session) -> Category:
    cat = Category(name="Ref Cat", slug="ref-cat-barcode", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()
    return cat


@pytest.mark.asyncio
async def test_sync_computes_system_sku_and_generates_barcode(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Shirt",
            "sku": "SHT-001",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await db_session.commit()

    result = await sync_product_variants(
        db_session,
        product_id=product.id,
        body=VariantSyncRequest(
            variants=[
                VariantSyncRow(
                    attribute_value_ids=[],
                    sku="USER-OVERRIDE-SKU",
                    reference_code="MERCH-001",
                    active=True,
                )
            ]
        ),
    )
    await db_session.commit()
    assert result.created >= 1 or result.updated >= 1

    res = await db_session.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id)
    )
    pv = res.scalars().first()
    assert pv is not None
    assert pv.sku == "SHT-001"
    assert pv.sku != "USER-OVERRIDE-SKU"
    assert pv.reference_code == "MERCH-001"
    assert pv.barcode is not None
    assert pv.barcode == _make_internal_ean13_from_variant_id(int(pv.id))


@pytest.mark.asyncio
async def test_reference_code_unique(db_session) -> None:
    from app.core.errors import ConflictError

    catalog_category = await _leaf_category(db_session)
    p1 = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "A",
            "sku": "AAA-001",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    p2 = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "B",
            "sku": "BBB-001",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await db_session.commit()

    await sync_product_variants(
        db_session,
        product_id=p1.id,
        body=VariantSyncRequest(
            variants=[VariantSyncRow(attribute_value_ids=[], reference_code="SHARED", active=True)]
        ),
    )
    await db_session.commit()

    with pytest.raises(ConflictError):
        await sync_product_variants(
            db_session,
            product_id=p2.id,
            body=VariantSyncRequest(
                variants=[VariantSyncRow(attribute_value_ids=[], reference_code="SHARED", active=True)]
            ),
        )
        await db_session.flush()


@pytest.mark.asyncio
async def test_export_variant_barcodes_csv(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "Export Me",
            "sku": "EXP-001",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await db_session.commit()
    await sync_product_variants(
        db_session,
        product_id=product.id,
        body=VariantSyncRequest(
            variants=[VariantSyncRow(attribute_value_ids=[], reference_code="X-1", active=True)]
        ),
    )
    await db_session.commit()

    csv_text = await export_variant_barcodes_csv(db_session, product_id=product.id, active_only=True)
    assert "system_sku" in csv_text
    assert "reference_code" in csv_text
    assert "EXP-001" in csv_text
    assert "X-1" in csv_text


@pytest.mark.asyncio
async def test_generate_missing_variant_barcodes(db_session) -> None:
    catalog_category = await _leaf_category(db_session)
    product = await create_product(
        db_session,
        data={
            "category_id": catalog_category.id,
            "name": "No Barcode",
            "sku": "NB-001",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await db_session.commit()

    res = await db_session.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id)
    )
    pv = res.scalars().first()
    assert pv is not None
    pv.barcode = None
    await db_session.commit()

    assigned = await generate_missing_variant_barcodes(db_session, product_id=product.id)
    await db_session.commit()
    assert assigned >= 1
    await db_session.refresh(pv)
    assert pv.barcode == _make_internal_ean13_from_variant_id(int(pv.id))
