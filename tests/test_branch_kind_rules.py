"""Branch kind rules: POS on commercial only, PO on warehouse only."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.category import Category
from app.models.product import Product
from app.services.seed_service import seed_permissions_and_roles


@pytest.mark.security
@pytest.mark.asyncio
async def test_pos_terminal_rejected_on_warehouse_branch(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_auth_header: dict[str, str],
) -> None:
    await seed_permissions_and_roles(db_session)
    res = await db_session.execute(select(Branch).where(Branch.code == "WH1"))
    wh = res.scalar_one()
    assert wh.kind == "warehouse"

    term = await client.post(
        "/api/v1/terminals",
        headers=admin_auth_header,
        json={
            "branch_id": wh.id,
            "name": "Bad POS",
            "terminal_code": f"T-{uuid.uuid4().hex[:8]}",
        },
    )
    assert term.status_code == 422, term.text
    assert term.json()["error"]["details"]["code"] == "branch_not_commercial"


@pytest.mark.security
@pytest.mark.asyncio
async def test_pos_terminal_allowed_on_commercial_branch(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_auth_header: dict[str, str],
) -> None:
    await seed_permissions_and_roles(db_session)
    res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = res.scalar_one()
    assert store.kind == "commercial"

    term = await client.post(
        "/api/v1/terminals",
        headers=admin_auth_header,
        json={
            "branch_id": store.id,
            "name": "Store POS",
            "terminal_code": f"T-{uuid.uuid4().hex[:8]}",
        },
    )
    assert term.status_code == 200, term.text


@pytest.mark.security
@pytest.mark.asyncio
async def test_purchase_order_rejected_on_commercial_branch(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_auth_header: dict[str, str],
) -> None:
    await seed_permissions_and_roles(db_session)
    cat = Category(name="Kind PO", slug=f"kp-{uuid.uuid4().hex[:6]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()
    product = Product(
        category_id=cat.id,
        name="Widget",
        sku=f"W-{uuid.uuid4().hex[:6]}",
        status="active",
        output_vat_rate=0,
    )
    db_session.add(product)
    await db_session.flush()

    res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = res.scalar_one()

    po = await client.post(
        "/api/v1/purchase-orders",
        headers=admin_auth_header,
        json={
            "supplier_name": "Supplier",
            "branch_id": store.id,
            "lines": [{"product_id": product.id, "qty": 1}],
        },
    )
    assert po.status_code == 422, po.text
    assert po.json()["error"]["details"]["code"] == "branch_not_warehouse"


@pytest.mark.security
@pytest.mark.asyncio
async def test_purchase_order_allowed_on_warehouse_branch(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_auth_header: dict[str, str],
) -> None:
    await seed_permissions_and_roles(db_session)
    cat = Category(
        name="Kind PO WH", slug=f"kw-{uuid.uuid4().hex[:6]}", sort_order=0, is_active=True
    )
    db_session.add(cat)
    await db_session.flush()
    product = Product(
        category_id=cat.id,
        name="Bolt",
        sku=f"B-{uuid.uuid4().hex[:6]}",
        status="active",
        output_vat_rate=0,
    )
    db_session.add(product)
    await db_session.flush()

    res = await db_session.execute(select(Branch).where(Branch.code == "WH1"))
    wh = res.scalar_one()

    po = await client.post(
        "/api/v1/purchase-orders",
        headers=admin_auth_header,
        json={
            "supplier_name": "Supplier",
            "branch_id": wh.id,
            "lines": [{"product_id": product.id, "qty": 2}],
        },
    )
    assert po.status_code == 201, po.text
    assert po.json()["branch_id"] == wh.id
