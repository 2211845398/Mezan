"""Supplier API validation."""

from __future__ import annotations

import uuid

import pytest

from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_create_supplier_requires_email(client, db_session, admin_auth_header) -> None:
    await seed_accounting_defaults(db_session)
    code = f"SUP-{uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/v1/suppliers",
        headers=admin_auth_header,
        json={
            "code": code,
            "first_name": "No",
            "family_name": "Email",
            "currency_code": "USD",
            "contact": {},
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_supplier_with_email(client, db_session, admin_auth_header) -> None:
    await seed_accounting_defaults(db_session)
    code = f"SUP-{uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/v1/suppliers",
        headers=admin_auth_header,
        json={
            "code": code,
            "first_name": "With",
            "family_name": "Email",
            "currency_code": "USD",
            "contact": {"email": "vendor@example.com"},
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["contact"]["email"] == "vendor@example.com"
