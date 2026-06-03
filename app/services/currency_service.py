"""Currency master and base-currency settings (Epic 24)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.ap_open_item import ApOpenItem
from app.models.ar_open_item import ArOpenItem
from app.models.currency import Currency
from app.models.suppliers import Supplier
from app.schemas.currencies import (
    AccountingSettingsRead,
    CurrencyCreate,
    CurrencyRateUpdate,
    CurrencyRead,
    CurrencyUpdate,
)
from app.services.accounting_service import get_accounting_settings

_FX_QUANT = Decimal("0.00000001")


def _currency_to_read(c: Currency, *, is_base: bool) -> CurrencyRead:
    return CurrencyRead(
        id=c.id,
        code=c.code,
        name=c.name,
        decimal_places=c.decimal_places,
        suffix=c.suffix,
        exchange_rate_to_base=c.exchange_rate_to_base,
        active=c.active,
        is_base=is_base,
    )


async def list_currencies(
    db: AsyncSession, *, active_only: bool = True, include_inactive: bool = False
) -> list[CurrencyRead]:
    settings = await get_accounting_settings(db)
    stmt = select(Currency).order_by(Currency.code.asc())
    if active_only and not include_inactive:
        stmt = stmt.where(Currency.active.is_(True))
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    return [_currency_to_read(c, is_base=c.id == settings.base_currency_id) for c in rows]


async def get_currency_by_code(db: AsyncSession, code: str) -> Currency:
    normalized = code.strip().upper()
    res = await db.execute(select(Currency).where(Currency.code == normalized))
    cur = res.scalar_one_or_none()
    if not cur:
        raise NotFoundError("Currency not found", details={"code": normalized})
    if not cur.active:
        raise ValidationError("Currency is inactive", details={"code": normalized})
    return cur


async def resolve_currency_id(
    db: AsyncSession,
    *,
    currency_id: int | None,
    currency_code: str | None,
) -> int:
    if currency_id is not None:
        res = await db.execute(select(Currency).where(Currency.id == currency_id))
        cur = res.scalar_one_or_none()
        if not cur or not cur.active:
            raise ValidationError(
                "Invalid or inactive currency_id", details={"currency_id": currency_id}
            )
        return cur.id
    if currency_code:
        return (await get_currency_by_code(db, currency_code)).id
    raise ValidationError("currency_id or currency_code is required")


async def create_currency(db: AsyncSession, body: CurrencyCreate) -> CurrencyRead:
    settings = await get_accounting_settings(db)
    existing = await db.execute(select(Currency).where(Currency.code == body.code))
    if existing.scalar_one_or_none():
        raise ConflictError("Currency code already exists", details={"code": body.code})

    rate = body.exchange_rate_to_base
    if rate is not None:
        rate = Decimal(str(rate)).quantize(_FX_QUANT, rounding=ROUND_HALF_UP)

    row = Currency(
        code=body.code,
        name=body.name.strip(),
        decimal_places=body.decimal_places,
        suffix=body.suffix,
        exchange_rate_to_base=rate,
        active=True,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _currency_to_read(row, is_base=row.id == settings.base_currency_id)


async def update_currency(db: AsyncSession, currency_id: int, body: CurrencyUpdate) -> CurrencyRead:
    settings = await get_accounting_settings(db)
    res = await db.execute(select(Currency).where(Currency.id == currency_id))
    row = res.scalar_one_or_none()
    if not row:
        raise NotFoundError("Currency not found", details={"currency_id": currency_id})

    is_base = row.id == settings.base_currency_id
    data = body.model_dump(exclude_unset=True)
    if is_base and data.get("active") is False:
        raise ValidationError("Cannot deactivate the base currency")

    for key, val in data.items():
        setattr(row, key, val)
    await db.flush()
    await db.refresh(row)
    return _currency_to_read(row, is_base=is_base)


async def update_currency_rate(
    db: AsyncSession, currency_id: int, body: CurrencyRateUpdate
) -> CurrencyRead:
    settings = await get_accounting_settings(db)
    res = await db.execute(select(Currency).where(Currency.id == currency_id))
    row = res.scalar_one_or_none()
    if not row:
        raise NotFoundError("Currency not found", details={"currency_id": currency_id})
    if row.id == settings.base_currency_id:
        raise ValidationError("Base currency rate is always 1; change base currency in settings")

    row.exchange_rate_to_base = Decimal(str(body.exchange_rate_to_base)).quantize(
        _FX_QUANT, rounding=ROUND_HALF_UP
    )
    await db.flush()
    await db.refresh(row)
    return _currency_to_read(row, is_base=False)


async def get_accounting_settings_read(db: AsyncSession) -> AccountingSettingsRead:
    settings = await get_accounting_settings(db)
    res = await db.execute(select(Currency).where(Currency.id == settings.base_currency_id))
    base = res.scalar_one()
    return AccountingSettingsRead(
        base_currency_id=base.id,
        base_currency_code=base.code,
        base_currency_name=base.name,
    )


async def update_base_currency(
    db: AsyncSession, *, base_currency_id: int
) -> AccountingSettingsRead:
    settings = await get_accounting_settings(db)
    res = await db.execute(select(Currency).where(Currency.id == base_currency_id))
    new_base = res.scalar_one_or_none()
    if not new_base or not new_base.active:
        raise ValidationError(
            "Base currency must be an active currency",
            details={"base_currency_id": base_currency_id},
        )

    if new_base.id != settings.base_currency_id:
        ar_foreign = await db.execute(
            select(func.count())
            .select_from(ArOpenItem)
            .where(
                ArOpenItem.amount_open > 0,
                ArOpenItem.currency_code != new_base.code,
            )
        )
        ap_foreign = await db.execute(
            select(func.count())
            .select_from(ApOpenItem)
            .where(
                ApOpenItem.amount_open > 0,
                ApOpenItem.currency_code != new_base.code,
            )
        )
        if (ar_foreign.scalar() or 0) > 0 or (ap_foreign.scalar() or 0) > 0:
            raise ValidationError(
                "Cannot change base currency while foreign-currency AR/AP open items exist. "
                "Run FX revaluation and close or settle items first.",
                details={"base_currency_id": base_currency_id},
            )

        old_base_res = await db.execute(
            select(Currency).where(Currency.id == settings.base_currency_id)
        )
        old_base = old_base_res.scalar_one()
        if old_base.exchange_rate_to_base is None or old_base.exchange_rate_to_base <= 0:
            old_base.exchange_rate_to_base = Decimal("1")

        settings.base_currency_id = new_base.id
        new_base.exchange_rate_to_base = Decimal("1").quantize(_FX_QUANT, rounding=ROUND_HALF_UP)

    await db.flush()
    return await get_accounting_settings_read(db)


async def assert_currency_not_in_use_for_deactivate(db: AsyncSession, currency_id: int) -> None:
    sup = await db.execute(
        select(func.count()).select_from(Supplier).where(Supplier.currency_id == currency_id)
    )
    if (sup.scalar() or 0) > 0:
        raise ValidationError(
            "Currency is assigned to suppliers; deactivate suppliers or reassign first",
            details={"currency_id": currency_id},
        )
