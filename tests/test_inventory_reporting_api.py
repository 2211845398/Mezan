"""Inventory reporting HTTP routes (stock-on-hand, reorder alerts)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.core
@pytest.mark.asyncio
async def test_stock_on_hand_accepts_high_limit(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"branch_id": 1, "limit": 2000, "offset": 0},
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.core
@pytest.mark.asyncio
async def test_reorder_alerts_list_route(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    resp = await client.get(
        "/api/v1/inventory/reorder-alerts",
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.core
@pytest.mark.asyncio
async def test_reorder_create_purchase_order_route_exists(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    resp = await client.post(
        "/api/v1/inventory/reorder-alerts/create-purchase-order",
        json={},
        headers=admin_auth_header,
    )
    assert resp.status_code != 404
    assert resp.status_code in (200, 422)
