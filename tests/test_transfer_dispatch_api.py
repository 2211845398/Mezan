"""Transfer dispatch/receive HTTP contract."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.services.inventory_service import apply_stock_movement


async def _seed_transfer_batch(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> tuple[int, int]:
    b_from = Branch(
        name="Dispatch From",
        code=f"DF-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    b_to = Branch(
        name="Dispatch To",
        code=f"DT-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add_all([b_from, b_to])
    await db_session.flush()

    category = Category(
        name="Dispatch Cat",
        slug=f"dc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Dispatch Product",
        sku=f"dp-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
    )
    db_session.add(product)
    await db_session.flush()
    pv = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv)
    await db_session.flush()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-dispatch:{product.id}",
        branch_id=b_from.id,
        product_id=product.id,
        qty_delta=10,
        reason="adjustment",
        variant_id=pv.id,
    )
    await db_session.commit()

    created = await client.post(
        "/api/v1/transfers",
        headers=admin_auth_header,
        json={
            "from_branch_id": b_from.id,
            "to_branch_id": b_to.id,
            "lines": [{"product_id": product.id, "variant_id": pv.id, "qty": 3}],
        },
    )
    assert created.status_code == 201, created.text
    batch_id = created.json()["id"]
    return batch_id, b_from.id


@pytest.mark.core
@pytest.mark.asyncio
async def test_dispatch_accepts_empty_json_body(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    batch_id, _ = await _seed_transfer_batch(client, admin_auth_header, db_session)

    resp = await client.post(
        f"/api/v1/transfers/{batch_id}/dispatch",
        headers=admin_auth_header,
        json={},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "in_transit"


@pytest.mark.core
@pytest.mark.asyncio
async def test_dispatch_accepts_active_branch_id_in_body(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    batch_id, from_branch_id = await _seed_transfer_batch(client, admin_auth_header, db_session)

    resp = await client.post(
        f"/api/v1/transfers/{batch_id}/dispatch",
        headers=admin_auth_header,
        json={"branch_id": from_branch_id},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "in_transit"
