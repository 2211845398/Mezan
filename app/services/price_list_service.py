"""CRUD for named price lists (W-5.3); v1 does not auto-resolve at POS (documentation list)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError, ValidationError
from app.models.branch import Branch
from app.models.price_list import PriceList, PriceListBranch, PriceListLine
from app.schemas.price_list import (
    PriceListCreate,
    PriceListLineRead,
    PriceListLineUpdate,
    PriceListRead,
    PriceListSummaryRead,
    PriceListUpdate,
)


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


async def _assert_branches_exist(db: AsyncSession, branch_ids: Sequence[int]) -> None:
    if not branch_ids:
        return
    res = await db.execute(select(Branch.id).where(Branch.id.in_(list(branch_ids))))
    found = {r[0] for r in res.all()}
    missing = set(branch_ids) - found
    if missing:
        raise ValidationError("Unknown branch_id", details={"branch_ids": sorted(missing)})


async def list_price_list_summaries(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[PriceListSummaryRead]:
    line_sub = (
        select(PriceListLine.price_list_id, func.count(PriceListLine.id).label("n"))
        .group_by(PriceListLine.price_list_id)
        .subquery()
    )
    br_sub = (
        select(PriceListBranch.price_list_id, func.count(PriceListBranch.branch_id).label("n"))
        .group_by(PriceListBranch.price_list_id)
        .subquery()
    )
    q = (
        select(
            PriceList,
            func.coalesce(line_sub.c.n, 0).label("line_count"),
            func.coalesce(br_sub.c.n, 0).label("branch_count"),
        )
        .outerjoin(line_sub, line_sub.c.price_list_id == PriceList.id)
        .outerjoin(br_sub, br_sub.c.price_list_id == PriceList.id)
        .order_by(PriceList.id.desc())
        .limit(limit)
        .offset(offset)
    )
    res = await db.execute(q)
    out: list[PriceListSummaryRead] = []
    for pl, line_count, branch_count in res.all():
        out.append(
            PriceListSummaryRead(
                id=pl.id,
                name=pl.name,
                effective_from=pl.effective_from,
                effective_to=pl.effective_to,
                is_active=pl.is_active,
                branch_count=int(branch_count or 0),
                line_count=int(line_count or 0),
                created_at=pl.created_at,
                updated_at=pl.updated_at,
            )
        )
    return out


async def get_price_list(db: AsyncSession, price_list_id: int) -> PriceListRead:
    res = await db.execute(
        select(PriceList)
        .options(
            selectinload(PriceList.branches),
            selectinload(PriceList.lines),
        )
        .where(PriceList.id == price_list_id)
    )
    pl = res.scalar_one_or_none()
    if not pl:
        raise NotFoundError("Price list not found", details={"price_list_id": price_list_id})
    return _to_read(pl)


def _to_read(pl: PriceList) -> PriceListRead:
    b_ids = [b.branch_id for b in pl.branches]
    lines = [
        PriceListLineRead(
            id=ln.id,
            price_list_id=ln.price_list_id,
            product_id=ln.product_id,
            unit_price=ln.unit_price,
            currency_id=ln.currency_id,
        )
        for ln in sorted(pl.lines, key=lambda x: x.id)
    ]
    return PriceListRead(
        id=pl.id,
        name=pl.name,
        effective_from=pl.effective_from,
        effective_to=pl.effective_to,
        is_active=pl.is_active,
        branch_ids=b_ids,
        lines=lines,
        created_at=pl.created_at,
        updated_at=pl.updated_at,
    )


async def create_price_list(db: AsyncSession, *, data: dict[str, Any]) -> PriceListRead:
    body = PriceListCreate.model_validate(data)
    if body.effective_to is not None and body.effective_to < body.effective_from:
        raise ValidationError("effective_to must be >= effective_from")
    await _assert_branches_exist(db, body.branch_ids)

    pl = PriceList(
        name=body.name,
        effective_from=body.effective_from,
        effective_to=body.effective_to,
        is_active=body.is_active,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(pl)
    await db.flush()

    for bid in body.branch_ids:
        db.add(PriceListBranch(price_list_id=pl.id, branch_id=bid))
    for ln in body.lines:
        db.add(
            PriceListLine(
                price_list_id=pl.id,
                product_id=ln.product_id,
                unit_price=_q2(ln.unit_price),
                currency_id=ln.currency_id,
            )
        )
    await db.commit()

    res = await db.execute(
        select(PriceList)
        .options(selectinload(PriceList.branches), selectinload(PriceList.lines))
        .where(PriceList.id == pl.id)
    )
    return _to_read(res.scalar_one())


async def update_price_list(
    db: AsyncSession, *, price_list_id: int, data: dict[str, Any]
) -> PriceListRead:
    body = PriceListUpdate.model_validate({k: v for k, v in data.items() if v is not None})
    res = await db.execute(
        select(PriceList)
        .options(selectinload(PriceList.branches), selectinload(PriceList.lines))
        .where(PriceList.id == price_list_id)
    )
    pl = res.scalar_one_or_none()
    if not pl:
        raise NotFoundError("Price list not found", details={"price_list_id": price_list_id})

    if body.name is not None:
        pl.name = body.name
    if body.effective_from is not None:
        pl.effective_from = body.effective_from
    if body.effective_to is not None:
        pl.effective_to = body.effective_to
    if body.is_active is not None:
        pl.is_active = body.is_active

    eff_from = pl.effective_from
    eff_to = pl.effective_to
    if eff_to is not None and eff_to < eff_from:
        raise ValidationError("effective_to must be >= effective_from")

    if body.branch_ids is not None:
        await _assert_branches_exist(db, body.branch_ids)
        for b in list(pl.branches):
            await db.delete(b)
        for bid in body.branch_ids:
            db.add(PriceListBranch(price_list_id=pl.id, branch_id=bid))

    pl.updated_at = datetime.now(UTC)
    await db.commit()

    res2 = await db.execute(
        select(PriceList)
        .options(selectinload(PriceList.branches), selectinload(PriceList.lines))
        .where(PriceList.id == pl.id)
    )
    return _to_read(res2.scalar_one())


async def upsert_line(
    db: AsyncSession,
    *,
    price_list_id: int,
    line_id: int | None,
    product_id: int,
    unit_price: Decimal,
    currency_id: int | None,
) -> PriceListRead:
    res = await db.execute(select(PriceList).where(PriceList.id == price_list_id))
    if not res.scalar_one_or_none():
        raise NotFoundError("Price list not found", details={"price_list_id": price_list_id})
    u = _q2(unit_price)
    if line_id is None:
        existing = await db.execute(
            select(PriceListLine).where(
                and_(
                    PriceListLine.price_list_id == price_list_id,
                    PriceListLine.product_id == product_id,
                )
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            row.unit_price = u
            row.currency_id = currency_id
        else:
            db.add(
                PriceListLine(
                    price_list_id=price_list_id,
                    product_id=product_id,
                    unit_price=u,
                    currency_id=currency_id,
                )
            )
    else:
        ln = await db.execute(
            select(PriceListLine).where(
                and_(PriceListLine.id == line_id, PriceListLine.price_list_id == price_list_id)
            )
        )
        row = ln.scalar_one_or_none()
        if not row:
            raise NotFoundError("Price list line not found", details={"line_id": line_id})
        row.product_id = product_id
        row.unit_price = u
        row.currency_id = currency_id
    await db.commit()
    return await get_price_list(db, price_list_id)


async def delete_line(db: AsyncSession, *, price_list_id: int, line_id: int) -> None:
    res = await db.execute(
        select(PriceListLine).where(
            and_(PriceListLine.id == line_id, PriceListLine.price_list_id == price_list_id)
        )
    )
    row = res.scalar_one_or_none()
    if not row:
        raise NotFoundError("Price list line not found", details={"line_id": line_id})
    await db.delete(row)
    pl = await db.get(PriceList, price_list_id)
    if pl:
        pl.updated_at = datetime.now(UTC)
    await db.commit()


async def patch_line(
    db: AsyncSession, *, price_list_id: int, line_id: int, data: PriceListLineUpdate
) -> PriceListRead:
    res = await db.execute(
        select(PriceListLine).where(
            and_(PriceListLine.id == line_id, PriceListLine.price_list_id == price_list_id)
        )
    )
    row = res.scalar_one_or_none()
    if not row:
        raise NotFoundError("Price list line not found", details={"line_id": line_id})
    if data.unit_price is not None:
        row.unit_price = _q2(data.unit_price)
    if data.currency_id is not None:
        row.currency_id = data.currency_id
    pl = await db.get(PriceList, price_list_id)
    if pl:
        pl.updated_at = datetime.now(UTC)
    await db.commit()
    return await get_price_list(db, price_list_id)
