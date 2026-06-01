"""Paginated list API contract tests."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting_settings import AccountingSettings
from app.services.seed_service import seed_accounting_defaults
from app.services.supplier_service import create_supplier


@pytest.mark.asyncio
async def test_suppliers_list_returns_items_and_total(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await seed_accounting_defaults(db_session)
    settings = await db_session.get(AccountingSettings, 1)
    assert settings is not None
    code = f"SUP-PG-{uuid.uuid4().hex[:6].upper()}"
    await create_supplier(
        db_session,
        code=code,
        first_name="Paginated",
        father_name=None,
        family_name="Supplier",
        currency_id=settings.base_currency_id,
        currency_code=None,
        payables_account_id=None,
    )

    resp = await client.get(
        "/api/v1/suppliers",
        params={"limit": 10, "offset": 0},
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert body["limit"] == 10
    assert body["offset"] == 0
    assert body["total"] >= 1
    assert any(row["code"] == code for row in body["items"])


@pytest.mark.asyncio
async def test_users_list_paginated(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    resp = await client.get(
        "/api/v1/users",
        params={"limit": 5, "offset": 0},
        headers=admin_auth_header,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["items"], list)
    assert body["total"] >= 1
    assert len(body["items"]) <= 5
