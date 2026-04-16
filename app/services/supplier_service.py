"""Supplier master service (Epic 5)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.suppliers import Supplier


async def create_supplier(
    db: AsyncSession,
    *,
    code: str,
    name: str,
    currency_id: int,
    payables_account_id: int | None,
) -> Supplier:
    existing = await db.execute(select(Supplier).where(Supplier.code == code))
    if existing.scalar_one_or_none():
        raise ConflictError("Supplier code already exists", details={"code": code})
    s = Supplier(
        code=code,
        name=name,
        currency_id=currency_id,
        payables_account_id=payables_account_id,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


async def list_suppliers(db: AsyncSession) -> list[Supplier]:
    res = await db.execute(select(Supplier).order_by(Supplier.name))
    return list(res.scalars().all())


async def get_supplier(db: AsyncSession, supplier_id: int) -> Supplier:
    res = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    s = res.scalar_one_or_none()
    if not s:
        raise NotFoundError("Supplier not found", details={"supplier_id": supplier_id})
    return s
