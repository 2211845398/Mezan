"""Reorder alerts split by branch kind (warehouse PO vs commercial transfer)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch


async def _branch_id_by_code(db_session: AsyncSession, code: str) -> int:
    res = await db_session.execute(select(Branch.id).where(Branch.code == code))
    return int(res.scalar_one())


async def _stock_row_for_branch(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    branch_id: int,
) -> dict | None:
    resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"branch_id": branch_id, "limit": 5},
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    rows = resp.json()
    return rows[0] if rows else None


async def _ensure_reorder_alert(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    *,
    branch_id: int,
    product_id: int,
    supplier_id: int,
) -> None:
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


@pytest.mark.core
@pytest.mark.asyncio
async def test_commercial_reorder_excluded_from_warehouse_po_alerts(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    commercial_id = await _branch_id_by_code(db_session, "ST1")
    row = await _stock_row_for_branch(client, admin_auth_header, commercial_id)
    if row is None:
        pytest.skip("No stock on commercial branch ST1")

    sup_resp = await client.post(
        "/api/v1/suppliers",
        headers=admin_auth_header,
        json={
            "first_name": "Commercial",
            "family_name": f"Supplier-{uuid.uuid4().hex[:6]}",
            "currency_code": "USD",
            "payables_account_id": None,
        },
    )
    assert sup_resp.status_code == 200, sup_resp.text
    supplier_id = sup_resp.json()["id"]

    await _ensure_reorder_alert(
        client,
        admin_auth_header,
        branch_id=commercial_id,
        product_id=row["product_id"],
        supplier_id=supplier_id,
    )

    warehouse_count = await client.get(
        "/api/v1/inventory/reorder-alerts/count",
        headers=admin_auth_header,
    )
    assert warehouse_count.status_code == 200
    warehouse_alerts = await client.get(
        "/api/v1/inventory/reorder-alerts",
        params={"branch_id": commercial_id},
        headers=admin_auth_header,
    )
    assert warehouse_alerts.status_code == 200
    commercial_matches = [
        a for a in warehouse_alerts.json() if a["product_id"] == row["product_id"]
    ]
    assert commercial_matches == []

    commercial_count = await client.get(
        "/api/v1/inventory/commercial-restock-alerts/count",
        headers=admin_auth_header,
    )
    assert commercial_count.status_code == 200
    assert commercial_count.json()["count"] >= 1

    commercial_alerts = await client.get(
        "/api/v1/inventory/commercial-restock-alerts",
        params={"branch_id": commercial_id},
        headers=admin_auth_header,
    )
    assert commercial_alerts.status_code == 200
    enriched = [a for a in commercial_alerts.json() if a["product_id"] == row["product_id"]]
    assert enriched
    alert = enriched[0]
    assert alert["variant_id"] == row["variant_id"]
    assert "suggested_qty" in alert
    assert "can_prefill_transfer" in alert
    assert "product_image_url" in alert

    create_resp = await client.post(
        "/api/v1/inventory/reorder-alerts/create-purchase-order",
        json={"branch_ids": [commercial_id], "product_ids": [row["product_id"]]},
        headers=admin_auth_header,
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["created"] == []


@pytest.mark.core
@pytest.mark.asyncio
async def test_warehouse_reorder_in_po_alerts_not_commercial_restock(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    warehouse_id = await _branch_id_by_code(db_session, "WH1")
    row = await _stock_row_for_branch(client, admin_auth_header, warehouse_id)
    if row is None:
        pytest.skip("No stock on warehouse branch WH1")

    sup_resp = await client.post(
        "/api/v1/suppliers",
        headers=admin_auth_header,
        json={
            "first_name": "Warehouse",
            "family_name": f"Supplier-{uuid.uuid4().hex[:6]}",
            "currency_code": "USD",
            "payables_account_id": None,
        },
    )
    assert sup_resp.status_code == 200, sup_resp.text
    supplier_id = sup_resp.json()["id"]

    await _ensure_reorder_alert(
        client,
        admin_auth_header,
        branch_id=warehouse_id,
        product_id=row["product_id"],
        supplier_id=supplier_id,
    )

    reorder_alerts = await client.get(
        "/api/v1/inventory/reorder-alerts",
        params={"branch_id": warehouse_id},
        headers=admin_auth_header,
    )
    assert reorder_alerts.status_code == 200
    assert any(a["product_id"] == row["product_id"] for a in reorder_alerts.json())

    commercial_alerts = await client.get(
        "/api/v1/inventory/commercial-restock-alerts",
        params={"branch_id": warehouse_id},
        headers=admin_auth_header,
    )
    assert commercial_alerts.status_code == 200
    assert not any(a["product_id"] == row["product_id"] for a in commercial_alerts.json())

    create_resp = await client.post(
        "/api/v1/inventory/reorder-alerts/create-purchase-order",
        json={"branch_ids": [warehouse_id], "product_ids": [row["product_id"]]},
        headers=admin_auth_header,
    )
    assert create_resp.status_code == 200, create_resp.text
    assert create_resp.json()["created"]


@pytest.mark.core
@pytest.mark.asyncio
async def test_stock_on_hand_branch_kind_filter(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    commercial_id = await _branch_id_by_code(db_session, "ST1")
    warehouse_id = await _branch_id_by_code(db_session, "WH1")

    commercial_ids_res = await db_session.execute(
        select(Branch.id).where(Branch.kind == "commercial", Branch.archived_at.is_(None))
    )
    commercial_ids = {int(i) for i in commercial_ids_res.scalars()}
    warehouse_ids_res = await db_session.execute(
        select(Branch.id).where(Branch.kind == "warehouse", Branch.archived_at.is_(None))
    )
    warehouse_ids = {int(i) for i in warehouse_ids_res.scalars()}
    assert commercial_id in commercial_ids
    assert warehouse_id in warehouse_ids

    commercial_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"branch_kind": "commercial", "limit": 20},
        headers=admin_auth_header,
    )
    assert commercial_resp.status_code == 200
    if commercial_resp.json():
        for row in commercial_resp.json():
            assert row["branch_id"] in commercial_ids

    warehouse_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"branch_kind": "warehouse", "limit": 20},
        headers=admin_auth_header,
    )
    assert warehouse_resp.status_code == 200
    if warehouse_resp.json():
        for row in warehouse_resp.json():
            assert row["branch_id"] in warehouse_ids


@pytest.mark.core
@pytest.mark.asyncio
async def test_commercial_restock_alert_suggests_warehouse_when_stock_available(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    commercial_id = await _branch_id_by_code(db_session, "ST1")
    warehouse_id = await _branch_id_by_code(db_session, "WH1")
    commercial_row = await _stock_row_for_branch(client, admin_auth_header, commercial_id)
    if commercial_row is None:
        pytest.skip("No stock on commercial branch ST1")

    warehouse_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"branch_id": warehouse_id, "variant_id": commercial_row["variant_id"], "limit": 5},
        headers=admin_auth_header,
    )
    assert warehouse_resp.status_code == 200
    wh_rows = warehouse_resp.json()
    if not wh_rows:
        pytest.skip("No matching variant stock at warehouse WH1")

    sup_resp = await client.post(
        "/api/v1/suppliers",
        headers=admin_auth_header,
        json={
            "first_name": "Restock",
            "family_name": f"Supplier-{uuid.uuid4().hex[:6]}",
            "currency_code": "USD",
            "payables_account_id": None,
        },
    )
    assert sup_resp.status_code == 200, sup_resp.text
    supplier_id = sup_resp.json()["id"]

    await _ensure_reorder_alert(
        client,
        admin_auth_header,
        branch_id=commercial_id,
        product_id=commercial_row["product_id"],
        supplier_id=supplier_id,
    )

    alerts_resp = await client.get(
        "/api/v1/inventory/commercial-restock-alerts",
        params={"branch_id": commercial_id},
        headers=admin_auth_header,
    )
    assert alerts_resp.status_code == 200
    matches = [
        a
        for a in alerts_resp.json()
        if a["variant_id"] == commercial_row["variant_id"]
    ]
    if not matches:
        pytest.skip("No commercial restock alert after policy setup")

    alert = matches[0]
    wh_available = int(wh_rows[0]["available"])
    suggested_qty = int(alert["suggested_qty"])
    if wh_available >= suggested_qty:
        assert alert["can_prefill_transfer"] is True
        assert alert["suggested_from_branch_id"] == warehouse_id
        assert alert["source_available"] >= suggested_qty
        assert alert["uom_id"] is not None
    else:
        assert alert["can_prefill_transfer"] is False
        assert alert["suggested_from_branch_id"] is None


@pytest.mark.core
@pytest.mark.asyncio
async def test_commercial_restock_alert_clears_after_pending_transfer(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    from sqlalchemy import select

    from app.models.unit_of_measure import UnitOfMeasure

    commercial_id = await _branch_id_by_code(db_session, "ST1")
    warehouse_id = await _branch_id_by_code(db_session, "WH1")
    commercial_row = await _stock_row_for_branch(client, admin_auth_header, commercial_id)
    if commercial_row is None:
        pytest.skip("No stock on commercial branch ST1")

    warehouse_resp = await client.get(
        "/api/v1/inventory/stock-on-hand",
        params={"branch_id": warehouse_id, "variant_id": commercial_row["variant_id"], "limit": 5},
        headers=admin_auth_header,
    )
    assert warehouse_resp.status_code == 200
    wh_rows = warehouse_resp.json()
    if not wh_rows:
        pytest.skip("No matching variant stock at warehouse WH1")

    sup_resp = await client.post(
        "/api/v1/suppliers",
        headers=admin_auth_header,
        json={
            "first_name": "Pending",
            "family_name": f"Supplier-{uuid.uuid4().hex[:6]}",
            "currency_code": "USD",
            "payables_account_id": None,
        },
    )
    assert sup_resp.status_code == 200, sup_resp.text
    supplier_id = sup_resp.json()["id"]

    await _ensure_reorder_alert(
        client,
        admin_auth_header,
        branch_id=commercial_id,
        product_id=commercial_row["product_id"],
        supplier_id=supplier_id,
    )

    alerts_resp = await client.get(
        "/api/v1/inventory/commercial-restock-alerts",
        params={"branch_id": commercial_id},
        headers=admin_auth_header,
    )
    assert alerts_resp.status_code == 200
    matches = [
        a
        for a in alerts_resp.json()
        if a["variant_id"] == commercial_row["variant_id"]
    ]
    if not matches:
        pytest.skip("No commercial restock alert after policy setup")

    alert = matches[0]
    if not alert.get("can_prefill_transfer"):
        pytest.skip("Warehouse cannot cover suggested transfer qty")

    xfer_qty = int(alert["suggested_qty"])
    uom_id = alert.get("uom_id")
    if uom_id is None:
        piece = (
            await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
        ).scalar_one()
        uom_id = piece.id

    transfer_resp = await client.post(
        "/api/v1/transfers",
        headers=admin_auth_header,
        json={
            "from_branch_id": warehouse_id,
            "to_branch_id": commercial_id,
            "lines": [
                {
                    "product_id": commercial_row["product_id"],
                    "variant_id": commercial_row["variant_id"],
                    "qty": xfer_qty,
                    "uom_id": uom_id,
                }
            ],
        },
    )
    assert transfer_resp.status_code == 201, transfer_resp.text

    alerts_after = await client.get(
        "/api/v1/inventory/commercial-restock-alerts",
        params={"branch_id": commercial_id},
        headers=admin_auth_header,
    )
    assert alerts_after.status_code == 200
    matches_after = [
        a
        for a in alerts_after.json()
        if a["variant_id"] == commercial_row["variant_id"]
    ]
    assert matches_after == []
