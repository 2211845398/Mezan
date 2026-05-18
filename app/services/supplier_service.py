"""Supplier master service (Epic 5 + W-5.4)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.currency import Currency
from app.models.suppliers import Supplier
from app.schemas.suppliers import SupplierRead
from app.utils.person_name import person_name_sql_expr


async def create_supplier(
    db: AsyncSession,
    *,
    code: str,
    first_name: str | None,
    father_name: str | None,
    family_name: str | None,
    currency_id: int,
    payables_account_id: int | None,
    tax_id: str | None = None,
    contact: dict[str, Any] | None = None,
    payment_terms: str | None = None,
) -> Supplier:
    existing = await db.execute(select(Supplier).where(Supplier.code == code))
    if existing.scalar_one_or_none():
        raise ConflictError("Supplier code already exists", details={"code": code})
    s = Supplier(
        code=code,
        first_name=first_name,
        father_name=father_name,
        family_name=family_name,
        currency_id=currency_id,
        payables_account_id=payables_account_id,
        tax_id=tax_id,
        contact=contact or {},
        payment_terms=payment_terms,
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
    for k, v in data.items():
        setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    return s
