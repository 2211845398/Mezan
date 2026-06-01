"""Purchase order send: supplier email + PDF attachment (atomic)."""

from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.core.errors import ExternalServiceError, ValidationError
from app.models.accounting_settings import AccountingSettings
from app.models.branch import Branch
from app.models.category import Category
from app.models.chart_accounts import ChartAccount
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.purchase_order import PurchaseOrder
from app.services import email_service
from app.services.purchase_order_send_service import send_purchase_order_to_supplier
from app.services.purchase_order_service import create_po
from app.services.seed_service import seed_accounting_defaults
from app.services.supplier_service import create_supplier


async def _po_fixture(db_session):
    await seed_accounting_defaults(db_session)
    settings = await db_session.get(AccountingSettings, 1)
    assert settings is not None

    ap_res = await db_session.execute(select(ChartAccount).where(ChartAccount.code == "2010"))
    ap_leaf = ap_res.scalar_one()

    branch = Branch(
        name="PO Email Branch",
        code=f"PEB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="PO Email Cat",
        slug=f"pec-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="PO Email Product",
        sku=f"pep-{uuid.uuid4().hex[:6]}",
        status="active",
        standard_cost=Decimal("5"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()
    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={"color": "red"},
        active=True,
    )
    db_session.add(variant)
    await db_session.flush()

    return settings, ap_leaf, branch, product, variant


@pytest.mark.asyncio
async def test_send_po_blocks_without_supplier_email(db_session, monkeypatch) -> None:
    settings, ap_leaf, branch, product, variant = await _po_fixture(db_session)
    supplier = await create_supplier(
        db_session,
        code=None,
        first_name="No",
        father_name=None,
        family_name="Mail",
        currency_id=settings.base_currency_id,
        payables_account_id=ap_leaf.id,
        contact={},
    )
    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_id": supplier.id,
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 2}],
        },
    )
    send_mock = AsyncMock()
    monkeypatch.setattr(email_service, "send_email", send_mock)

    with pytest.raises(ValidationError) as exc_info:
        await send_purchase_order_to_supplier(db_session, po_id=po.id, locale="en")

    assert exc_info.value.details is not None
    assert exc_info.value.details.get("code") == "supplier_email_missing"
    send_mock.assert_not_called()

    refreshed = await db_session.get(PurchaseOrder, po.id)
    assert refreshed is not None
    assert refreshed.status == "draft"


@pytest.mark.asyncio
async def test_send_po_emails_pdf_then_marks_sent(db_session, monkeypatch) -> None:
    settings, ap_leaf, branch, product, variant = await _po_fixture(db_session)
    supplier = await create_supplier(
        db_session,
        code=None,
        first_name="With",
        father_name=None,
        family_name="Mail",
        currency_id=settings.base_currency_id,
        payables_account_id=ap_leaf.id,
        contact={"email": "vendor@example.com"},
    )
    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_id": supplier.id,
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 3}],
        },
    )
    send_mock = AsyncMock()
    monkeypatch.setattr(email_service, "send_email", send_mock)

    result = await send_purchase_order_to_supplier(
        db_session, po_id=po.id, idempotency_key="idem-key-12345678", locale="en"
    )
    assert result.status == "sent"
    assert result.sent_at is not None
    send_mock.assert_awaited_once()
    kwargs = send_mock.await_args.kwargs
    assert kwargs["to"] == "vendor@example.com"
    attachments = kwargs["attachments"]
    assert len(attachments) == 1
    assert attachments[0].filename == f"purchase-order-{po.id}.pdf"
    assert len(attachments[0].content) > 100
    assert attachments[0].content[:4] == b"%PDF"


@pytest.mark.asyncio
async def test_send_po_email_failure_keeps_draft(db_session, monkeypatch) -> None:
    settings, ap_leaf, branch, product, variant = await _po_fixture(db_session)
    supplier = await create_supplier(
        db_session,
        code=None,
        first_name="Fail",
        father_name=None,
        family_name="Mail",
        currency_id=settings.base_currency_id,
        payables_account_id=ap_leaf.id,
        contact={"email": "fail@example.com"},
    )
    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_id": supplier.id,
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 1}],
        },
    )

    async def _fail(**_kwargs):
        raise ExternalServiceError(
            "Email delivery failed",
            details={"code": "email_delivery_failed"},
        )

    monkeypatch.setattr(email_service, "send_email", _fail)

    with pytest.raises(ExternalServiceError) as exc_info:
        await send_purchase_order_to_supplier(db_session, po_id=po.id, locale="en")

    assert exc_info.value.details is not None
    assert exc_info.value.details.get("code") == "email_delivery_failed"

    refreshed = await db_session.get(PurchaseOrder, po.id)
    assert refreshed is not None
    assert refreshed.status == "draft"


@pytest.mark.asyncio
async def test_send_po_idempotent_skips_second_email(db_session, monkeypatch) -> None:
    settings, ap_leaf, branch, product, variant = await _po_fixture(db_session)
    supplier = await create_supplier(
        db_session,
        code=None,
        first_name="Idem",
        father_name=None,
        family_name="Mail",
        currency_id=settings.base_currency_id,
        payables_account_id=ap_leaf.id,
        contact={"email": "idem@example.com"},
    )
    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_id": supplier.id,
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 1}],
        },
    )
    send_mock = AsyncMock()
    monkeypatch.setattr(email_service, "send_email", send_mock)
    idem = "repeat-key-12345678"

    first = await send_purchase_order_to_supplier(
        db_session, po_id=po.id, idempotency_key=idem, locale="en"
    )
    assert first.status == "sent"
    send_mock.assert_awaited_once()

    second = await send_purchase_order_to_supplier(
        db_session, po_id=po.id, idempotency_key=idem, locale="en"
    )
    assert second.status == "sent"
    send_mock.assert_awaited_once()
