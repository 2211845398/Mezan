"""Supplier master service (Epic 5 + W-5.4)."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.chart_accounts import AccountType, ChartAccount
from app.models.currency import Currency
from app.models.payment_terms import PaymentTerm
from app.models.suppliers import Supplier
from app.schemas.suppliers import SupplierRead
from app.services.currency_service import resolve_currency_id
from app.utils.person_name import person_name_sql_expr

_SUP_CODE_RE = re.compile(r"^SUP-(\d+)$", re.IGNORECASE)
_EXCLUDED_PAYABLES_CODES = frozenset({"2100", "2110", "2150", "2200"})


async def _validate_payables_account_id(
    db: AsyncSession, payables_account_id: int | None
) -> None:
    if payables_account_id is None:
        return
    res = await db.execute(
        select(ChartAccount).where(ChartAccount.id == payables_account_id)
    )
    account = res.scalar_one_or_none()
    if not account or not account.active:
        raise ValidationError(
            "Payables account not found or inactive",
            details={"payables_account_id": payables_account_id},
        )
    if account.account_type != AccountType.LIABILITY:
        raise ValidationError(
            "Payables account must be a liability account",
            details={"payables_account_id": payables_account_id, "account_type": account.account_type.value},
        )
    if account.is_control:
        raise ValidationError(
            "Payables account must be a leaf posting account, not a summary account",
            details={"payables_account_id": payables_account_id, "code": account.code},
        )
    if account.code in _EXCLUDED_PAYABLES_CODES:
        raise ValidationError(
            "This account cannot be used for supplier payables",
            details={"payables_account_id": payables_account_id, "code": account.code},
        )


async def _next_supplier_code(db: AsyncSession) -> str:
    res = await db.execute(select(Supplier.code).where(Supplier.code.ilike("SUP-%")))
    max_n = 0
    for (code,) in res.all():
        m = _SUP_CODE_RE.match(str(code).strip())
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"SUP-{max_n + 1:06d}"


async def _sync_payment_terms_fields(
    db: AsyncSession,
    *,
    payment_terms_id: int | None,
    payment_terms: str | None,
) -> tuple[int | None, str | None]:
    if payment_terms_id is not None:
        res = await db.execute(select(PaymentTerm).where(PaymentTerm.id == payment_terms_id))
        term = res.scalar_one_or_none()
        if not term:
            raise NotFoundError("Payment term not found", details={"payment_terms_id": payment_terms_id})
        return term.id, term.name_en
    return None, payment_terms


async def create_supplier(
    db: AsyncSession,
    *,
    code: str | None,
    first_name: str | None,
    father_name: str | None,
    family_name: str | None,
    currency_id: int | None,
    currency_code: str | None = None,
    payables_account_id: int | None,
    tax_id: str | None = None,
    contact: dict[str, Any] | None = None,
    payment_terms: str | None = None,
    payment_terms_id: int | None = None,
) -> Supplier:
    final_code = (code or "").strip() or await _next_supplier_code(db)
    existing = await db.execute(select(Supplier).where(Supplier.code == final_code))
    if existing.scalar_one_or_none():
        raise ConflictError("Supplier code already exists", details={"code": final_code})

    resolved_currency_id = await resolve_currency_id(
        db, currency_id=currency_id, currency_code=currency_code
    )
    pt_id, pt_label = await _sync_payment_terms_fields(
        db, payment_terms_id=payment_terms_id, payment_terms=payment_terms
    )
    await _validate_payables_account_id(db, payables_account_id)

    s = Supplier(
        code=final_code,
        first_name=first_name,
        father_name=father_name,
        family_name=family_name,
        currency_id=resolved_currency_id,
        payables_account_id=payables_account_id,
        tax_id=tax_id,
        contact=contact or {},
        payment_terms=pt_label,
        payment_terms_id=pt_id,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


def supplier_to_read(s: Supplier, currency: Currency | None = None) -> SupplierRead:
    return SupplierRead(
        id=s.id,
        code=s.code,
        first_name=s.first_name,
        father_name=s.father_name,
        family_name=s.family_name,
        currency_id=s.currency_id,
        currency_code=currency.code if currency else None,
        currency_name=currency.name if currency else None,
        payables_account_id=s.payables_account_id,
        tax_id=s.tax_id,
        contact=s.contact or {},
        payment_terms=s.payment_terms,
        payment_terms_id=s.payment_terms_id,
        created_at=s.created_at,
    )


async def list_suppliers(db: AsyncSession) -> list[Supplier]:
    disp = person_name_sql_expr(Supplier.first_name, Supplier.father_name, Supplier.family_name)
    res = await db.execute(select(Supplier).order_by(disp.asc().nulls_last(), Supplier.id.asc()))
    return list(res.scalars().all())


async def list_suppliers_read(db: AsyncSession) -> list[SupplierRead]:
    q = (
        select(Supplier, Currency)
        .join(Currency, Currency.id == Supplier.currency_id)
        .order_by(
            person_name_sql_expr(Supplier.first_name, Supplier.father_name, Supplier.family_name)
            .asc()
            .nulls_last(),
            Supplier.id.asc(),
        )
    )
    res = await db.execute(q)
    return [supplier_to_read(s, cur) for s, cur in res.all()]


async def get_supplier_read(db: AsyncSession, supplier_id: int) -> SupplierRead:
    res = await db.execute(
        select(Supplier, Currency)
        .join(Currency, Currency.id == Supplier.currency_id)
        .where(Supplier.id == supplier_id)
    )
    row = res.one_or_none()
    if not row:
        raise NotFoundError("Supplier not found", details={"supplier_id": supplier_id})
    s, cur = row
    return supplier_to_read(s, cur)


async def get_supplier(db: AsyncSession, supplier_id: int) -> Supplier:
    res = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    s = res.scalar_one_or_none()
    if not s:
        raise NotFoundError("Supplier not found", details={"supplier_id": supplier_id})
    return s


async def update_supplier(
    db: AsyncSession,
    *,
    supplier_id: int,
    data: dict[str, Any],
) -> Supplier:
    s = await get_supplier(db, supplier_id)
    currency_id = data.pop("currency_id", None)
    currency_code = data.pop("currency_code", None)
    if currency_id is not None or currency_code is not None:
        s.currency_id = await resolve_currency_id(
            db,
            currency_id=currency_id if currency_id is not None else s.currency_id,
            currency_code=currency_code,
        )

    if "payment_terms_id" in data or "payment_terms" in data:
        raw_pt_id = data.pop("payment_terms_id", s.payment_terms_id) if "payment_terms_id" in data else s.payment_terms_id
        raw_pt = data.pop("payment_terms", s.payment_terms) if "payment_terms" in data else s.payment_terms
        pt_id, pt_label = await _sync_payment_terms_fields(
            db,
            payment_terms_id=raw_pt_id,
            payment_terms=raw_pt,
        )
        s.payment_terms_id = pt_id
        s.payment_terms = pt_label

    if "payables_account_id" in data:
        await _validate_payables_account_id(db, data.get("payables_account_id"))

    for k, v in data.items():
        setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    return s
