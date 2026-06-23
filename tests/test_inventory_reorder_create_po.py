"""Integration tests for draft PO creation from inventory reorder alerts."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.branch import Branch
from app.models.product import Product


@pytest.mark.core
@pytest.mark.asyncio
async def test_create_purchase_orders_from_reorder_includes_uom_id(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session,
) -> None:
    stock_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"branch_kind": "warehouse", "limit": 5},
        headers=admin_auth_header,
    )
    assert stock_resp.status_code == 200
    rows = stock_resp.json()
    if not rows:
        wh_res = await db_session.execute(select(Branch.id).where(Branch.code == "WH1"))
        wh_id = wh_res.scalar_one_or_none()
        if wh_id is None:
            pytest.skip("No warehouse stock rows in seed data")
        stock_resp = await client.get(
            "/api/v1/inventory/stock-on-hand",
            params={"branch_id": int(wh_id), "limit": 5},
            headers=admin_auth_header,
        )
        rows = stock_resp.json()
    if not rows:
        pytest.skip("No stock rows in seed data")

    row = rows[0]
    branch_id = row["branch_id"]
    product_id = row["product_id"]

    sup_resp = await client.post(
        "/api/v1/suppliers",
        headers=admin_auth_header,
        json={
            "first_name": "Reorder",
            "family_name": f"Supplier-{uuid.uuid4().hex[:6]}",
            "currency_code": "USD",
            "payables_account_id": None,
        },
    )
    assert sup_resp.status_code == 200, sup_resp.text
    supplier_id = sup_resp.json()["id"]

    policy_resp = await client.patch(
        f"/api/v1/inventory/policies/{branch_id}/{product_id}",
        json={
            "reorder_point": 100_000,
            "reorder_qty": 10,
            "preferred_supplier_id": supplier_id,
            "is_active": True,
        },
        headers=admin_auth_header,
    )
    assert policy_resp.status_code == 200, policy_resp.text

    alerts_resp = await client.get(
        "/api/v1/inventory/reorder-alerts",
        params={"branch_id": branch_id},
        headers=admin_auth_header,
    )
    assert alerts_resp.status_code == 200
    alerts = alerts_resp.json()
    matching = [a for a in alerts if a["product_id"] == product_id]
    if not matching:
        pytest.skip("No reorder alert for seeded product after policy setup")

    create_resp = await client.post(
        "/api/v1/inventory/reorder-alerts/create-purchase-order",
        json={"branch_ids": [branch_id], "product_ids": [product_id]},
        headers=admin_auth_header,
    )
    assert create_resp.status_code == 200, create_resp.text
    body = create_resp.json()
    assert body["created"]
    po_id = body["created"][0]["purchase_order_id"]

    po_resp = await client.get(
        f"/api/v1/purchase-orders/{po_id}",
        headers=admin_auth_header,
    )
    assert po_resp.status_code == 200, po_resp.text
    po = po_resp.json()
    assert po["lines"]
    expected_uom = (
        await db_session.execute(select(Product.uom_id).where(Product.id == product_id))
    ).scalar_one()
    assert int(po["lines"][0]["uom_id"]) == int(expected_uom)
    assert int(po["lines"][0]["uom_id"]) > 0


@pytest.mark.core
@pytest.mark.asyncio
async def test_create_purchase_orders_from_reorder_empty_alerts_returns_200(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    """No matching alerts should succeed with an empty created list (not 500)."""
    resp = await client.post(
        "/api/v1/inventory/reorder-alerts/create-purchase-order",
        json={"branch_ids": [99999], "product_ids": [99999]},
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    assert resp.json()["created"] == []
