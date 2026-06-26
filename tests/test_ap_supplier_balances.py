"""AP supplier balance summary endpoint."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models.accounting_settings import AccountingSettings
from app.models.branch import Branch
from app.services.seed_service import seed_accounting_defaults
from app.services.subledger_service import create_ap_open_item, list_ap_supplier_balances
from app.services.supplier_service import create_supplier


@pytest.mark.asyncio
async def test_list_ap_supplier_balances_groups_open_amounts(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await db_session.get(AccountingSettings, 1)
    assert settings is not None

    branch = Branch(
        name="AP Bal Branch",
        code=f"AB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    supplier_a = await create_supplier(
        db_session,
        code=f"SUP-A-{uuid.uuid4().hex[:6]}",
        first_name="Alpha",
        father_name=None,
        family_name="Vendor",
        currency_id=settings.base_currency_id,
        contact={"email": "alpha@example.com"},
    )
    supplier_b = await create_supplier(
        db_session,
        code=f"SUP-B-{uuid.uuid4().hex[:6]}",
        first_name="Beta",
        father_name=None,
        family_name="Vendor",
        currency_id=settings.base_currency_id,
        contact={"email": "beta@example.com"},
    )

    await create_ap_open_item(
        db_session,
        data={
            "branch_id": branch.id,
            "supplier_id": supplier_a.id,
            "source_type": "manual_invoice",
            "source_id": f"INV-A-{uuid.uuid4().hex[:6]}",
            "description": "Invoice A",
            "document_date": date.today(),
            "amount_total": Decimal("100.00"),
            "currency_code": "USD",
        },
    )
    await create_ap_open_item(
        db_session,
        data={
            "branch_id": branch.id,
            "supplier_id": supplier_a.id,
            "source_type": "manual_invoice",
            "source_id": f"INV-A2-{uuid.uuid4().hex[:6]}",
            "description": "Invoice A2",
            "document_date": date.today(),
            "amount_total": Decimal("50.00"),
            "currency_code": "USD",
        },
    )
    await create_ap_open_item(
        db_session,
        data={
            "branch_id": branch.id,
            "supplier_id": supplier_b.id,
            "source_type": "manual_invoice",
            "source_id": f"INV-B-{uuid.uuid4().hex[:6]}",
            "description": "Invoice B",
            "document_date": date.today(),
            "amount_total": Decimal("75.00"),
            "currency_code": "USD",
        },
    )
    await db_session.commit()

    rows = await list_ap_supplier_balances(db_session, branch_id=branch.id)
    by_id = {r["supplier_id"]: r for r in rows}
    assert by_id[supplier_a.id]["open_balance"] == Decimal("150.00")
    assert by_id[supplier_b.id]["open_balance"] == Decimal("75.00")


@pytest.mark.asyncio
async def test_ap_supplier_balances_api(client, db_session, admin_auth_header) -> None:
    await seed_accounting_defaults(db_session)
    settings = await db_session.get(AccountingSettings, 1)
    assert settings is not None

    branch = Branch(
        name="API Bal Branch",
        code=f"APIB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    supplier = await create_supplier(
        db_session,
        code=f"SUP-API-{uuid.uuid4().hex[:6]}",
        first_name="API",
        father_name=None,
        family_name="Vendor",
        currency_id=settings.base_currency_id,
        contact={"email": "api-vendor@example.com"},
    )
    await create_ap_open_item(
        db_session,
        data={
            "branch_id": branch.id,
            "supplier_id": supplier.id,
            "source_type": "manual_invoice",
            "source_id": f"INV-API-{uuid.uuid4().hex[:6]}",
            "description": "API invoice",
            "document_date": date.today(),
            "amount_total": Decimal("42.00"),
            "currency_code": "USD",
        },
    )
    await db_session.commit()

    res = await client.get(
        "/api/v1/accounting/ap/supplier-balances",
        params={"branch_id": branch.id},
        headers=admin_auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    match = [r for r in body if r["supplier_id"] == supplier.id]
    assert len(match) == 1
    assert Decimal(match[0]["open_balance"]) == Decimal("42.00")
