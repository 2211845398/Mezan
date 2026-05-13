"""AR/AP open-item subledger services and aging helpers."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.currency import Currency
from app.models.ap_open_item import ApOpenItem
from app.models.ap_payment_application import ApPaymentApplication
from app.models.ar_open_item import ArOpenItem
from app.models.ar_payment_application import ArPaymentApplication
from app.services.document_posting_service import post_ap_payment_gl, post_ar_cash_receipt_gl


def _d(value: Decimal | int | str) -> Decimal:
    """Coerce to Decimal with 2 decimal places. Rejects float to prevent precision loss."""
    if isinstance(value, float):
        raise TypeError("float is not accepted for money values; use Decimal, int, or str")
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _next_status(amount_open: Decimal) -> str:
    if amount_open <= Decimal("0.00"):
        return "closed"
    return "partial"


def _days_overdue(due_date: date | None) -> int | None:
    if due_date is None:
        return None
    return (date.today() - due_date).days


_FX_RATE_QUANT = Decimal("0.00000001")


async def _fx_rate_at_open_item_creation(db: AsyncSession, *, currency_code: str) -> Decimal | None:
    """Txn functional rate: 1 for base currency; else `currencies.exchange_rate_to_base` when set."""
    from app.services.accounting_service import get_accounting_settings

    settings = await get_accounting_settings(db)
    base_res = await db.execute(select(Currency).where(Currency.id == settings.base_currency_id))
    base_cur = base_res.scalar_one()
    code = (currency_code or "USD").strip()
    if code == str(base_cur.code).strip():
        return Decimal("1").quantize(_FX_RATE_QUANT, rounding=ROUND_HALF_UP)
    cur_res = await db.execute(select(Currency).where(Currency.code == code))
    cur = cur_res.scalar_one_or_none()
    if cur is None or cur.exchange_rate_to_base is None or cur.exchange_rate_to_base <= 0:
        return None
    return Decimal(str(cur.exchange_rate_to_base)).quantize(_FX_RATE_QUANT, rounding=ROUND_HALF_UP)


async def create_ar_open_item(db: AsyncSession, *, data: dict) -> ArOpenItem:
    amount_total = _d(data["amount_total"])
    if amount_total <= Decimal("0.00"):
        raise ValidationError("amount_total must be greater than zero")
    cc = (data.get("currency_code") or "USD").strip()
    if data.get("fx_rate") is not None:
        fx_rate: Decimal | None = Decimal(str(data["fx_rate"])).quantize(
            _FX_RATE_QUANT, rounding=ROUND_HALF_UP
        )
    else:
        fx_rate = await _fx_rate_at_open_item_creation(db, currency_code=cc)
    row = ArOpenItem(
        branch_id=data["branch_id"],
        customer_id=data.get("customer_id"),
        source_type=data["source_type"],
        source_id=data["source_id"],
        description=data.get("description"),
        document_date=data["document_date"],
        due_date=data.get("due_date"),
        currency_code=cc,
        fx_rate=fx_rate,
        amount_total=amount_total,
        amount_open=amount_total,
        status="open",
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def create_ap_open_item(db: AsyncSession, *, data: dict) -> ApOpenItem:
    amount_total = _d(data["amount_total"])
    if amount_total <= Decimal("0.00"):
        raise ValidationError("amount_total must be greater than zero")
    cc = (data.get("currency_code") or "USD").strip()
    if data.get("fx_rate") is not None:
        fx_rate: Decimal | None = Decimal(str(data["fx_rate"])).quantize(
            _FX_RATE_QUANT, rounding=ROUND_HALF_UP
        )
    else:
        fx_rate = await _fx_rate_at_open_item_creation(db, currency_code=cc)
    row = ApOpenItem(
        branch_id=data["branch_id"],
        supplier_id=data.get("supplier_id"),
        source_type=data["source_type"],
        source_id=data["source_id"],
        description=data.get("description"),
        document_date=data["document_date"],
        due_date=data.get("due_date"),
        currency_code=cc,
        fx_rate=fx_rate,
        amount_total=amount_total,
        amount_open=amount_total,
        status="open",
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def list_ar_open_items(
    db: AsyncSession, *, branch_id: int | None = None, status: str | None = None
) -> list[ArOpenItem]:
    stmt = select(ArOpenItem).order_by(ArOpenItem.due_date.asc().nulls_last(), ArOpenItem.id.asc())
    if branch_id is not None:
        stmt = stmt.where(ArOpenItem.branch_id == branch_id)
    if status:
        stmt = stmt.where(ArOpenItem.status == status)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_ap_open_items(
    db: AsyncSession, *, branch_id: int | None = None, status: str | None = None
) -> list[ApOpenItem]:
    stmt = select(ApOpenItem).order_by(ApOpenItem.due_date.asc().nulls_last(), ApOpenItem.id.asc())
    if branch_id is not None:
        stmt = stmt.where(ApOpenItem.branch_id == branch_id)
    if status:
        stmt = stmt.where(ApOpenItem.status == status)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def apply_ar_payment(
    db: AsyncSession,
    *,
    ar_open_item_id: int,
    amount: Decimal,
    reference: str | None,
    note: str | None,
    created_by_user_id: int | None,
) -> ArPaymentApplication:
    result = await db.execute(select(ArOpenItem).where(ArOpenItem.id == ar_open_item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("AR open item not found", details={"ar_open_item_id": ar_open_item_id})
    amt = _d(amount)
    if amt <= Decimal("0.00"):
        raise ValidationError("amount must be greater than zero")
    if amt > _d(item.amount_open):
        raise ValidationError("amount exceeds open balance")

    application = ArPaymentApplication(
        ar_open_item_id=item.id,
        amount=amt,
        reference=reference,
        note=note,
        created_by_user_id=created_by_user_id,
        applied_at=datetime.now(UTC),
    )
    item.amount_open = _d(item.amount_open) - amt
    item.status = _next_status(_d(item.amount_open))
    db.add(application)
    await db.flush()
    await post_ar_cash_receipt_gl(
        db,
        branch_id=item.branch_id,
        amount=amt,
        application_id=application.id,
        entry_date=application.applied_at.date(),
    )
    await db.refresh(application)
    return application


async def apply_ap_payment(
    db: AsyncSession,
    *,
    ap_open_item_id: int,
    amount: Decimal,
    reference: str | None,
    note: str | None,
    created_by_user_id: int | None,
) -> ApPaymentApplication:
    result = await db.execute(select(ApOpenItem).where(ApOpenItem.id == ap_open_item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("AP open item not found", details={"ap_open_item_id": ap_open_item_id})
    amt = _d(amount)
    if amt <= Decimal("0.00"):
        raise ValidationError("amount must be greater than zero")
    if amt > _d(item.amount_open):
        raise ValidationError("amount exceeds open balance")

    application = ApPaymentApplication(
        ap_open_item_id=item.id,
        amount=amt,
        reference=reference,
        note=note,
        created_by_user_id=created_by_user_id,
        applied_at=datetime.now(UTC),
    )
    item.amount_open = _d(item.amount_open) - amt
    item.status = _next_status(_d(item.amount_open))
    db.add(application)
    await db.flush()

    await post_ap_payment_gl(
        db,
        branch_id=item.branch_id,
        amount=amt,
        application_id=application.id,
        entry_date=application.applied_at.date(),
    )

    await db.refresh(application)
    return application


def serialize_ar_item(item: ArOpenItem) -> dict:
    return {
        "id": item.id,
        "branch_id": item.branch_id,
        "customer_id": item.customer_id,
        "source_type": item.source_type,
        "source_id": item.source_id,
        "description": item.description,
        "document_date": item.document_date,
        "due_date": item.due_date,
        "currency_code": item.currency_code,
        "fx_rate": item.fx_rate,
        "amount_total": _d(item.amount_total),
        "amount_open": _d(item.amount_open),
        "status": item.status,
        "days_overdue": _days_overdue(item.due_date),
    }


def serialize_ap_item(item: ApOpenItem) -> dict:
    return {
        "id": item.id,
        "branch_id": item.branch_id,
        "supplier_id": item.supplier_id,
        "source_type": item.source_type,
        "source_id": item.source_id,
        "description": item.description,
        "document_date": item.document_date,
        "due_date": item.due_date,
        "currency_code": item.currency_code,
        "fx_rate": item.fx_rate,
        "amount_total": _d(item.amount_total),
        "amount_open": _d(item.amount_open),
        "status": item.status,
        "days_overdue": _days_overdue(item.due_date),
    }
