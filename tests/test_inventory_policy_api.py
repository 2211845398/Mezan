"""Inventory policy HTTP routes and reorder status integration."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.core
@pytest.mark.asyncio
async def test_inventory_policy_get_returns_default_when_missing(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    resp = await client.get(
        "/api/v1/inventory/policies/99999/99999",
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == 0
    assert body["branch_id"] == 99999
    assert body["product_id"] == 99999
    assert body["reorder_point"] == 0
    assert body["reorder_qty"] == 0
    assert body["is_active"] is True
    assert body["is_custom_policy"] is False


@pytest.mark.core
@pytest.mark.asyncio
async def test_inventory_policy_default_then_upsert_becomes_custom(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    stock_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"limit": 10},
        headers=admin_auth_header,
    )
    assert stock_resp.status_code == 200
    rows = stock_resp.json()
    if not rows:
        pytest.skip("No stock rows in seed data")

    branch_ids = {r["branch_id"] for r in rows}
    product_id = rows[0]["product_id"]
    missing_branch = next((b for b in range(1, 100) if b not in branch_ids), 99998)

    default_resp = await client.get(
        f"/api/v1/inventory/policies/{missing_branch}/{product_id}",
        headers=admin_auth_header,
    )
    assert default_resp.status_code == 200
    assert default_resp.json()["is_custom_policy"] is False

    patch_resp = await client.patch(
        f"/api/v1/inventory/policies/{missing_branch}/{product_id}",
        json={
            "reorder_point": 3,
            "reorder_qty": 6,
            "is_active": True,
        },
        headers=admin_auth_header,
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()
    assert patched["is_custom_policy"] is True
    assert patched["id"] > 0
    assert patched["reorder_point"] == 3

    get_resp = await client.get(
        f"/api/v1/inventory/policies/{missing_branch}/{product_id}",
        headers=admin_auth_header,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["is_custom_policy"] is True


@pytest.mark.core
@pytest.mark.asyncio
async def test_inventory_policy_upsert_and_get(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    stock_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"limit": 1},
        headers=admin_auth_header,
    )
    assert stock_resp.status_code == 200
    rows = stock_resp.json()
    if not rows:
        pytest.skip("No stock rows in seed data")

    row = rows[0]
    branch_id = row["branch_id"]
    product_id = row["product_id"]

    patch_resp = await client.patch(
        f"/api/v1/inventory/policies/{branch_id}/{product_id}",
        json={
            "reorder_point": 5,
            "reorder_qty": 10,
            "preferred_supplier_id": None,
            "lead_time_days": 3,
            "is_active": True,
        },
        headers=admin_auth_header,
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["branch_id"] == branch_id
    assert body["product_id"] == product_id
    assert body["reorder_point"] == 5
    assert body["reorder_qty"] == 10
    assert body["is_active"] is True
    assert body["is_custom_policy"] is True

    get_resp = await client.get(
        f"/api/v1/inventory/policies/{branch_id}/{product_id}",
        headers=admin_auth_header,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == body["id"]


@pytest.mark.core
@pytest.mark.asyncio
async def test_inventory_policy_changes_stock_on_hand_status(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    stock_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"limit": 5},
        headers=admin_auth_header,
    )
    assert stock_resp.status_code == 200
    rows = stock_resp.json()
    if not rows:
        pytest.skip("No stock rows in seed data")

    row = next((r for r in rows if r.get("reorder_status") == "none"), rows[0])
    branch_id = row["branch_id"]
    product_id = row["product_id"]
    available = row["available"]

    reorder_point = max(available + 100, 1)
    patch_resp = await client.patch(
        f"/api/v1/inventory/policies/{branch_id}/{product_id}",
        json={
            "reorder_point": reorder_point,
            "reorder_qty": 20,
            "is_active": True,
        },
        headers=admin_auth_header,
    )
    assert patch_resp.status_code == 200

    filtered_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"branch_id": branch_id, "limit": 2000},
        headers=admin_auth_header,
    )
    assert filtered_resp.status_code == 200
    updated = next(
        (r for r in filtered_resp.json() if r["product_id"] == product_id),
        None,
    )
    assert updated is not None
    assert updated["reorder_status"] != "none"
    assert updated["reorder_point"] == reorder_point


@pytest.mark.core
@pytest.mark.asyncio
async def test_product_stock_card_route(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    stock_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"limit": 1},
        headers=admin_auth_header,
    )
    assert stock_resp.status_code == 200
    rows = stock_resp.json()
    if not rows:
        pytest.skip("No stock rows in seed data")

    product_id = rows[0]["product_id"]
    resp = await client.get(
        f"/api/v1/inventory/products/{product_id}/stock-card",
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["product_id"] == product_id
    assert isinstance(body["branches"], list)
    assert isinstance(body["recent_movements"], list)


@pytest.mark.core
@pytest.mark.asyncio
async def test_movements_filter_by_variant_id(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    stock_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"limit": 1},
        headers=admin_auth_header,
    )
    assert stock_resp.status_code == 200
    rows = stock_resp.json()
    if not rows:
        pytest.skip("No stock rows in seed data")

    row = rows[0]
    resp = await client.get(
        "/api/v1/inventory/movements",
        params={
            "branch_id": row["branch_id"],
            "product_id": row["product_id"],
            "variant_id": row["variant_id"],
            "limit": 10,
        },
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    movements = resp.json()
    assert isinstance(movements, list)
    for mv in movements:
        assert mv["variant_id"] == row["variant_id"]
        assert "variant_name" in mv
