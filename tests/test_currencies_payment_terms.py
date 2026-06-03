"""Currency master, payment terms, and supplier code generation."""

from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting_settings import AccountingSettings
from app.models.payment_terms import PaymentTerm
from app.models.suppliers import Supplier
from app.services.payment_terms_service import due_date_from_supplier, parse_net_days_from_text
from app.services.seed_service import seed_accounting_defaults
from app.services.supplier_service import _next_supplier_code


def test_parse_net_days_from_text() -> None:
    assert parse_net_days_from_text("Net 30") == 30
    assert parse_net_days_from_text("Net 0") == 0
    assert parse_net_days_from_text(None) is None


@pytest.mark.asyncio
async def test_next_supplier_code_sequential(db_session: AsyncSession) -> None:
    await seed_accounting_defaults(db_session)
    settings = await db_session.get(AccountingSettings, 1)
    assert settings is not None
    code1 = await _next_supplier_code(db_session)
    db_session.add(
        Supplier(
            code=code1,
            first_name="A",
            currency_id=settings.base_currency_id,
            contact={},
        )
    )
    await db_session.flush()
    code2 = await _next_supplier_code(db_session)
    assert code1.startswith("SUP-")
    assert code2.startswith("SUP-")
    assert code1 != code2


@pytest.mark.asyncio
async def test_due_date_from_supplier_payment_term_id(db_session: AsyncSession) -> None:
    await seed_accounting_defaults(db_session)
    settings = await db_session.get(AccountingSettings, 1)
    assert settings is not None
    res = await db_session.execute(select(PaymentTerm).where(PaymentTerm.code == "NET_30"))
    term = res.scalar_one()
    supplier = Supplier(
        code="SUP-TEST-DUE",
        first_name="Due",
        currency_id=settings.base_currency_id,
        payment_terms_id=term.id,
        payment_terms=term.name_en,
        contact={},
    )
    db_session.add(supplier)
    await db_session.flush()

    doc = date(2026, 5, 1)
    due = await due_date_from_supplier(
        db_session,
        supplier_id=supplier.id,
        document_date=doc,
        explicit_due_date=None,
    )
    assert due == date(2026, 5, 31)


@pytest.mark.asyncio
async def test_list_currencies_api(client: AsyncClient, admin_auth_header: dict[str, str]) -> None:
    res = await client.get("/api/v1/accounting/currencies", headers=admin_auth_header)
    assert res.status_code == 200
    rows = res.json()
    assert isinstance(rows, list)
    assert any(r.get("code") == "USD" for r in rows)
