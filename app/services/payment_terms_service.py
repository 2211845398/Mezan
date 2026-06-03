"""Payment terms master service."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.payment_terms import PaymentTerm
from app.models.suppliers import Supplier
from app.schemas.payment_terms import PaymentTermCreate, PaymentTermRead, PaymentTermUpdate


def parse_net_days_from_text(text: str | None) -> int | None:
    if not text:
        return None
    t = text.strip()
    if not t.lower().startswith("net"):
        return None
    tail = t[3:].strip()
    try:
        return int(tail)
    except ValueError:
        return None


async def list_payment_terms(
    db: AsyncSession, *, active_only: bool = True
) -> list[PaymentTermRead]:
    stmt = select(PaymentTerm).order_by(PaymentTerm.days.asc(), PaymentTerm.code.asc())
    if active_only:
        stmt = stmt.where(PaymentTerm.active.is_(True))
    res = await db.execute(stmt)
    return [PaymentTermRead.model_validate(r) for r in res.scalars().all()]


async def get_payment_term(db: AsyncSession, term_id: int) -> PaymentTerm:
    res = await db.execute(select(PaymentTerm).where(PaymentTerm.id == term_id))
    row = res.scalar_one_or_none()
    if not row:
        raise NotFoundError("Payment term not found", details={"payment_terms_id": term_id})
    return row


async def create_payment_term(db: AsyncSession, body: PaymentTermCreate) -> PaymentTermRead:
    code = body.code.strip().upper()
    dup = await db.execute(select(PaymentTerm).where(PaymentTerm.code == code))
    if dup.scalar_one_or_none():
        raise ConflictError("Payment term code already exists", details={"code": code})
    row = PaymentTerm(
        code=code,
        name_en=body.name_en.strip(),
        name_ar=body.name_ar.strip(),
        days=body.days,
        active=body.active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return PaymentTermRead.model_validate(row)


async def update_payment_term(
    db: AsyncSession, term_id: int, body: PaymentTermUpdate
) -> PaymentTermRead:
    row = await get_payment_term(db, term_id)
    for key, val in body.model_dump(exclude_unset=True).items():
        setattr(row, key, val)
    await db.commit()
    await db.refresh(row)
    return PaymentTermRead.model_validate(row)


async def resolve_supplier_payment_term_label(db: AsyncSession, supplier: Supplier) -> str | None:
    if supplier.payment_terms_id is not None:
        term = await get_payment_term(db, supplier.payment_terms_id)
        return term.name_en
    return supplier.payment_terms


async def due_date_from_supplier(
    db: AsyncSession,
    *,
    supplier_id: int | None,
    document_date: date,
    explicit_due_date: date | None,
) -> date | None:
    if explicit_due_date is not None:
        return explicit_due_date
    if supplier_id is None:
        return None
    res = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = res.scalar_one_or_none()
    if not supplier:
        return None
    days: int | None = None
    if supplier.payment_terms_id is not None:
        term = await get_payment_term(db, supplier.payment_terms_id)
        days = term.days
    else:
        days = parse_net_days_from_text(supplier.payment_terms)
    if days is None:
        return None
    return document_date + timedelta(days=days)
