"""AR/AP open-item subledger services and aging helpers."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.ap_open_item import ApOpenItem
from app.models.ap_payment_application import ApPaymentApplication
from app.models.ar_open_item import ArOpenItem
from app.models.ar_payment_application import ArPaymentApplication
from app.models.currency import Currency
from app.models.goods_receipt import GoodsReceipt
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.sales_invoice import SalesInvoice
from app.models.suppliers import Supplier
from app.services.document_posting_service import post_ap_payment_gl, post_ar_cash_receipt_gl
from app.services.payment_terms_service import due_date_from_supplier
from app.utils.money import q2


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
    due_date = await due_date_from_supplier(
        db,
        supplier_id=data.get("supplier_id"),
        document_date=data["document_date"],
        explicit_due_date=data.get("due_date"),
    )
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
        due_date=due_date,
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
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    status: str | None = None,
    source_type: str | None = None,
    source_id: str | None = None,
) -> list[ArOpenItem]:
    stmt = select(ArOpenItem).order_by(ArOpenItem.due_date.asc().nulls_last(), ArOpenItem.id.asc())
    if branch_id is not None:
        stmt = stmt.where(ArOpenItem.branch_id == branch_id)
    if status:
        stmt = stmt.where(ArOpenItem.status == status)
    if source_type:
        stmt = stmt.where(ArOpenItem.source_type == source_type)
    if source_id is not None:
        stmt = stmt.where(ArOpenItem.source_id == source_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_ap_open_items(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    status: str | None = None,
    supplier_id: int | None = None,
) -> list[ApOpenItem]:
    stmt = select(ApOpenItem).order_by(ApOpenItem.due_date.asc().nulls_last(), ApOpenItem.id.asc())
    if branch_id is not None:
        stmt = stmt.where(ApOpenItem.branch_id == branch_id)
    if status:
        stmt = stmt.where(ApOpenItem.status == status)
    if supplier_id is not None:
        stmt = stmt.where(ApOpenItem.supplier_id == supplier_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def find_ap_open_item_by_source(
    db: AsyncSession,
    *,
    source_type: str,
    source_id: str,
) -> ApOpenItem | None:
    result = await db.execute(
        select(ApOpenItem).where(
            ApOpenItem.source_type == source_type,
            ApOpenItem.source_id == source_id,
        )
    )
    return result.scalar_one_or_none()


async def goods_receipt_total_ext(db: AsyncSession, receipt_id: int) -> Decimal:
    result = await db.execute(
        select(GoodsReceiptLine).where(GoodsReceiptLine.goods_receipt_id == receipt_id)
    )
    total = Decimal("0")
    for line in result.scalars().all():
        total += q2(line.unit_cost * Decimal(line.qty))
    return q2(total)


async def ensure_ap_open_item_for_goods_receipt(
    db: AsyncSession,
    *,
    receipt: GoodsReceipt,
) -> ApOpenItem | None:
    """Create AP open item for a posted goods receipt (idempotent)."""
    if receipt.supplier_id is None:
        return None
    existing = await find_ap_open_item_by_source(
        db,
        source_type="goods_receipt",
        source_id=str(receipt.id),
    )
    if existing is not None:
        return existing
    total_ext = await goods_receipt_total_ext(db, receipt.id)
    if total_ext <= Decimal("0.00"):
        return None
    currency_code = "USD"
    sup_res = await db.execute(
        select(Supplier, Currency)
        .join(Currency, Currency.id == Supplier.currency_id)
        .where(Supplier.id == receipt.supplier_id)
    )
    row = sup_res.one_or_none()
    if row is not None:
        currency_code = str(row[1].code)
    entry_date = receipt.created_at.date() if receipt.created_at else date.today()
    description = (
        f"Goods receipt {receipt.invoice_number}"
        if receipt.invoice_number
        else f"Goods receipt {receipt.id}"
    )
    return await create_ap_open_item(
        db,
        data={
            "branch_id": receipt.branch_id,
            "supplier_id": receipt.supplier_id,
            "source_type": "goods_receipt",
            "source_id": str(receipt.id),
            "description": description,
            "document_date": entry_date,
            "currency_code": currency_code,
            "amount_total": total_ext,
        },
    )


async def backfill_ap_open_items_from_goods_receipts(db: AsyncSession) -> int:
    """Create missing AP open items for historical goods receipts."""
    result = await db.execute(select(GoodsReceipt).where(GoodsReceipt.supplier_id.isnot(None)))
    created = 0
    for receipt in result.scalars().all():
        before = await find_ap_open_item_by_source(
            db,
            source_type="goods_receipt",
            source_id=str(receipt.id),
        )
        if before is not None:
            continue
        item = await ensure_ap_open_item_for_goods_receipt(db, receipt=receipt)
        if item is not None:
            created += 1
    return created


async def list_ap_supplier_balances(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
) -> list[dict]:
    """Open AP balance grouped by supplier."""
    stmt = (
        select(
            ApOpenItem.supplier_id,
            func.coalesce(func.sum(ApOpenItem.amount_open), 0).label("open_balance"),
            func.max(ApOpenItem.currency_code).label("currency_code"),
        )
        .where(
            ApOpenItem.supplier_id.isnot(None),
            ApOpenItem.amount_open > 0,
        )
        .group_by(ApOpenItem.supplier_id)
    )
    if branch_id is not None:
        stmt = stmt.where(ApOpenItem.branch_id == branch_id)
    res = await db.execute(stmt)
    rows = []
    for supplier_id, open_balance, currency_code in res.all():
        if supplier_id is None:
            continue
        sup = await db.get(Supplier, int(supplier_id))
        if sup is None:
            continue
        name_parts = [sup.first_name, sup.father_name, sup.family_name]
        supplier_name = " ".join(p.strip() for p in name_parts if p and str(p).strip()) or sup.code
        rows.append(
            {
                "supplier_id": int(supplier_id),
                "supplier_name": supplier_name,
                "supplier_code": sup.code,
                "open_balance": q2(open_balance),
                "currency_code": str(currency_code or "USD"),
            }
        )
    rows.sort(key=lambda r: r["supplier_name"].casefold())
    return rows


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
    if item.source_type == "sales_invoice":
        try:
            inv_id = int(item.source_id)
        except (TypeError, ValueError):
            inv_id = 0
        if inv_id > 0:
            inv_res = await db.execute(select(SalesInvoice).where(SalesInvoice.id == inv_id))
            inv = inv_res.scalar_one_or_none()
            if inv is not None and inv.voided_at is None:
                if _d(item.amount_open) <= Decimal("0.00"):
                    inv.payment_status = "paid"
                else:
                    inv.payment_status = "partially_paid"
    await post_ar_cash_receipt_gl(
        db,
        branch_id=item.branch_id,
        amount=amt,
        application_id=application.id,
        entry_date=application.applied_at.date(),
        customer_id=item.customer_id,
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
        supplier_id=item.supplier_id,
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
