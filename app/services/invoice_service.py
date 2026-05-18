"""Finalize checkout into immutable invoice."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, StateTransitionError, ValidationError
from app.models.ar_open_item import ArOpenItem
from app.models.category import Category
from app.models.pos_cart import PosCart, PosCartLine
from app.models.pos_payment import PaymentIntent, PaymentReceipt
from app.models.branch import Branch
from app.models.customer_profile import CustomerProfile
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.sales_invoice import InvoicePayment, SalesInvoice, SalesInvoiceLine
from app.models.sales_return import SalesReturn
from app.schemas.sales_invoice import (
    SalesInvoiceDetailRead,
    SalesInvoiceLineRead,
    SalesInvoiceListItem,
    SalesInvoicePaymentRead,
)
from app.services.accounting_governance_service import (
    list_journal_entries_for_source,
    reverse_journal_entry,
    same_fiscal_period_as_today,
)
from app.services.document_posting_service import post_sales_invoice_gl
from app.services.inventory_service import apply_stock_movement
from app.services.catalog_service import resolve_default_variant_id
from app.services.loyalty_dsl_service import calculate_loyalty_for_purchase
from app.services.loyalty_service import adjust_points
from app.models.loyalty import LedgerEntryType, LedgerReasonCode
from app.services.numbering_service import next_sales_invoice_number
from app.services.shift_service import add_cash_event
from app.utils.money import q2
from app.utils.person_name import display_person_name

VOID_INVOICE_MAX_AGE_HOURS = 48


async def finalize_paid_cart(
    db: AsyncSession,
    *,
    cart_id: int,
    payment_intent_id: int,
    idempotency_key: str,
    user_id: int,
) -> SalesInvoice:
    existing = await db.execute(select(SalesInvoice).where(SalesInvoice.cart_id == cart_id))
    inv = existing.scalar_one_or_none()
    if inv:
        return inv
    cart_res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = cart_res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if cart.status != "checkout_locked":
        raise StateTransitionError(
            "Cart must be checkout_locked before finalize",
            details={"status": cart.status},
        )
    pi_res = await db.execute(select(PaymentIntent).where(PaymentIntent.id == payment_intent_id))
    payment_intent = pi_res.scalar_one_or_none()
    if not payment_intent or payment_intent.cart_id != cart.id:
        raise ConflictError("Payment intent does not belong to cart")
    await db.refresh(payment_intent)
    if payment_intent.status != "succeeded":
        raise StateTransitionError("Payment is not completed")
    line_res = await db.execute(select(PosCartLine).where(PosCartLine.cart_id == cart.id))
    lines = [ln for ln in line_res.scalars().all() if int(ln.qty or 0) > 0]
    if not lines:
        raise ConflictError("Cannot finalize empty cart")

    issued_at = datetime.now(UTC)
    invoice_number = await next_sales_invoice_number(
        db,
        branch_id=cart.branch_id,
        issued_at=issued_at,
    )
    invoice_barcode = f"INVBC-{uuid.uuid4().hex[:16]}"
    invoice = SalesInvoice(
        invoice_number=invoice_number,
        invoice_barcode=invoice_barcode,
        cart_id=cart.id,
        terminal_id=cart.terminal_id,
        branch_id=cart.branch_id,
        customer_id=cart.customer_id,
        subtotal=cart.subtotal,
        discount_total=cart.discount_total,
        tax_total=cart.tax_total,
        total=cart.total,
        created_by_user_id=user_id,
        created_at=issued_at,
    )
    db.add(invoice)
    await db.flush()

    rec_res = await db.execute(
        select(PaymentReceipt).where(PaymentReceipt.payment_intent_id == payment_intent.id)
    )
    receipt = rec_res.scalar_one_or_none()
    tender_method = receipt.method if receipt else "cash"
    paid_amount = q2(receipt.amount) if receipt else q2(payment_intent.amount)

    # Epic 21.3: cash tender updates shift expected_cash via add_cash_event (not raw PosCashEvent only).
    # Epic 21.6: Handle transfer tender method with clearing account
    if tender_method == "cash" and cart.shift_id:
        await add_cash_event(
            db,
            shift_id=cart.shift_id,
            event_type="sale",
            amount=paid_amount,
            note=f"Cart {cart.id} invoice {invoice.id}",
            created_by_user_id=user_id,
        )

    for idx, ln in enumerate(lines):
        variant_id = (
            ln.variant_id
            if ln.variant_id is not None
            else await resolve_default_variant_id(db, product_id=ln.product_id)
        )
        db.add(
            SalesInvoiceLine(
                sales_invoice_id=invoice.id,
                product_id=ln.product_id,
                variant_id=variant_id,
                qty=ln.qty,
                unit_price=ln.unit_price,
                line_total=ln.line_total,
                tax_rate=ln.tax_rate,
                line_tax_amount=ln.line_tax_amount,
            )
        )
        await apply_stock_movement(
            db,
            idempotency_key=f"{idempotency_key}:line:{idx}",
            branch_id=cart.branch_id,
            product_id=ln.product_id,
            qty_delta=-ln.qty,
            reason="sale",
            ref_type="sales_invoice",
            ref_id=str(invoice.id),
            variant_id=variant_id,
        )
    db.add(
        InvoicePayment(
            sales_invoice_id=invoice.id,
            payment_intent_id=payment_intent.id,
            amount=paid_amount,
            method=tender_method,
            reference=receipt.reference if receipt else payment_intent.external_id,
        )
    )
    # Session uses autoflush=False: GL posting sums `invoice_payments` from the DB — flush first.
    await db.flush()
    sil_res = await db.execute(
        select(SalesInvoiceLine).where(SalesInvoiceLine.sales_invoice_id == invoice.id)
    )
    await post_sales_invoice_gl(db, invoice=invoice, lines=list(sil_res.scalars().all()))

    if cart.customer_id:
        category_codes: list[str] = []
        if lines:
            pids = [ln.product_id for ln in lines]
            cat_stmt = (
                select(Category.slug)
                .join(Product, Product.category_id == Category.id)
                .where(Product.id.in_(pids))
                .distinct()
            )
            crows = await db.execute(cat_stmt)
            category_codes = sorted(
                {(str(row[0]).strip().upper()) for row in crows.all() if row[0]}
            )
        calc = calculate_loyalty_for_purchase(
            cart_total=invoice.total,
            category_codes=category_codes,
            is_weekend=issued_at.weekday() >= 5,
        )
        points = int(calc["calculation"]["total_points"])
        if points > 0:
            await adjust_points(
                db,
                customer_id=cart.customer_id,
                points=points,
                entry_type=LedgerEntryType.CREDIT,
                reason_code=LedgerReasonCode.PURCHASE,
                auditor_id=user_id,
                reference_id=f"INV-{invoice.id}",
                note=f"Purchase loyalty: {points} points",
            )

    cart.status = "paid"
    cart.paid_at = issued_at
    await db.commit()
    await db.refresh(invoice)
    return invoice


def _within_void_time_window(created_at: datetime, *, now: datetime) -> bool:
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return (now - created_at) <= timedelta(hours=VOID_INVOICE_MAX_AGE_HOURS)


async def void_sales_invoice(
    db: AsyncSession,
    *,
    invoice_id: int | None = None,
    invoice_barcode: str | None = None,
    reason: str | None,
    actor_user_id: int,
) -> SalesInvoice:
    """Void a POS sale: eligibility checks, stock restore, GL reversals, optional AR row cleanup.

    Idempotent: if already voided, returns the invoice unchanged.
    """
    if (invoice_id is None) == (invoice_barcode is None):
        raise ValidationError("Provide exactly one of invoice_id or invoice_barcode")

    if invoice_id is not None:
        inv_res = await db.execute(select(SalesInvoice).where(SalesInvoice.id == invoice_id))
    else:
        inv_res = await db.execute(
            select(SalesInvoice).where(SalesInvoice.invoice_barcode == invoice_barcode)
        )
    invoice = inv_res.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice not found")

    if invoice.voided_at is not None:
        return invoice

    now = datetime.now(UTC)
    created = invoice.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    if not _within_void_time_window(created, now=now):
        raise ValidationError(
            "Invoice is outside the void time window",
            details={"max_hours": VOID_INVOICE_MAX_AGE_HOURS},
        )
    if not same_fiscal_period_as_today(created.date(), today=now.date()):
        raise ValidationError("Void is only allowed in the same fiscal period as the invoice")

    ret_chk = await db.execute(
        select(SalesReturn.id).where(SalesReturn.sales_invoice_id == invoice.id).limit(1)
    )
    if ret_chk.scalar_one_or_none() is not None:
        raise ValidationError("Cannot void an invoice that has a sales return")

    ar_res = await db.execute(
        select(ArOpenItem).where(
            ArOpenItem.source_type == "sales_invoice",
            ArOpenItem.source_id == str(invoice.id),
        )
    )
    for ar_item in ar_res.scalars().all():
        if ar_item.amount_open < ar_item.amount_total:
            raise ValidationError(
                "Cannot void: AR payments have been applied to this invoice",
                details={"ar_open_item_id": ar_item.id},
            )
        await db.delete(ar_item)

    line_res = await db.execute(
        select(SalesInvoiceLine).where(SalesInvoiceLine.sales_invoice_id == invoice.id)
    )
    lines = list(line_res.scalars().all())
    for idx, ln in enumerate(lines):
        await apply_stock_movement(
            db,
            idempotency_key=f"void_invoice:{invoice.id}:stock:{idx}",
            branch_id=invoice.branch_id,
            product_id=ln.product_id,
            qty_delta=ln.qty,
            reason="void_invoice",
            ref_type="sales_invoice_void",
            ref_id=str(invoice.id),
            variant_id=ln.variant_id,
        )

    reversal_date = now.date()
    entries = await list_journal_entries_for_source(
        db, source_type="sales_invoice", source_id=str(invoice.id)
    )
    for entry in entries:
        await reverse_journal_entry(
            db,
            journal_entry_id=entry.id,
            actor_user_id=actor_user_id,
            reason=reason,
            reversal_date=reversal_date,
        )

    invoice.voided_at = now
    invoice.void_reason = reason
    invoice.voided_by_user_id = actor_user_id

    await db.commit()
    await db.refresh(invoice)
    return invoice


async def _sales_invoice_to_detail_read(
    db: AsyncSession, invoice: SalesInvoice
) -> SalesInvoiceDetailRead:
    line_res = await db.execute(
        select(SalesInvoiceLine).where(SalesInvoiceLine.sales_invoice_id == invoice.id)
    )
    lines = list(line_res.scalars().all())
    product_ids = {ln.product_id for ln in lines}
    prods: dict[int, Product] = {}
    if product_ids:
        pres = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        prods = {p.id: p for p in pres.scalars().all()}

    line_reads: list[SalesInvoiceLineRead] = []
    for ln in lines:
        p = prods.get(ln.product_id)
        line_reads.append(
            SalesInvoiceLineRead(
                id=ln.id,
                product_id=ln.product_id,
                product_name=p.name if p else "",
                product_sku=p.sku if p else "",
                barcode=p.barcode if p else None,
                qty=ln.qty,
                unit_price=ln.unit_price,
                line_total=ln.line_total,
                tax_rate=ln.tax_rate,
                line_tax_amount=ln.line_tax_amount,
            )
        )

    pay_res = await db.execute(
        select(InvoicePayment, PaymentIntent)
        .outerjoin(PaymentIntent, InvoicePayment.payment_intent_id == PaymentIntent.id)
        .where(InvoicePayment.sales_invoice_id == invoice.id)
    )
    payments: list[SalesInvoicePaymentRead] = []
    for ip, pint in pay_res.all():
        payments.append(
            SalesInvoicePaymentRead(
                method=ip.method,
                amount=ip.amount,
                reference=ip.reference,
                currency=pint.currency if pint is not None else None,
            )
        )

    return SalesInvoiceDetailRead(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_barcode=invoice.invoice_barcode,
        cart_id=invoice.cart_id,
        terminal_id=invoice.terminal_id,
        branch_id=invoice.branch_id,
        customer_id=invoice.customer_id,
        subtotal=invoice.subtotal,
        discount_total=invoice.discount_total,
        tax_total=invoice.tax_total,
        total=invoice.total,
        created_at=invoice.created_at,
        voided_at=invoice.voided_at,
        void_reason=invoice.void_reason,
        lines=line_reads,
        payments=payments,
    )


async def read_sales_invoice_detail(db: AsyncSession, *, invoice_id: int) -> SalesInvoiceDetailRead:
    inv_res = await db.execute(select(SalesInvoice).where(SalesInvoice.id == invoice_id))
    invoice = inv_res.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice not found")
    return await _sales_invoice_to_detail_read(db, invoice)


async def list_sales_invoices_for_terminal_window(
    db: AsyncSession,
    *,
    terminal_id: int,
    start_inclusive: datetime,
    end_exclusive: datetime,
) -> list[SalesInvoiceListItem]:
    t_res = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = t_res.scalar_one_or_none()
    if not terminal:
        raise NotFoundError("Terminal not found")

    inv_res = await db.execute(
        select(SalesInvoice, CustomerProfile)
        .outerjoin(CustomerProfile, SalesInvoice.customer_id == CustomerProfile.id)
        .where(
            SalesInvoice.terminal_id == terminal_id,
            SalesInvoice.branch_id == terminal.branch_id,
            SalesInvoice.created_at >= start_inclusive,
            SalesInvoice.created_at < end_exclusive,
            SalesInvoice.voided_at.is_(None),
        )
        .order_by(SalesInvoice.created_at.desc())
    )
    rows = inv_res.all()
    out: list[SalesInvoiceListItem] = []
    for inv, cust in rows:
        cust_disp: str | None = None
        if cust is not None:
            name = display_person_name(cust.first_name, cust.father_name, cust.family_name)
            cust_disp = name or (cust.phone or "").strip() or None
        out.append(
            SalesInvoiceListItem(
                id=inv.id,
                invoice_number=inv.invoice_number,
                invoice_barcode=inv.invoice_barcode,
                cart_id=inv.cart_id,
                terminal_id=inv.terminal_id,
                branch_id=inv.branch_id,
                customer_id=inv.customer_id,
                customer_display=cust_disp,
                subtotal=inv.subtotal,
                discount_total=inv.discount_total,
                tax_total=inv.tax_total,
                total=inv.total,
                created_at=inv.created_at,
            )
        )
    return out


async def list_sales_invoices_register_page(
    db: AsyncSession,
    *,
    branch_id: int,
    start_inclusive: datetime,
    end_exclusive: datetime,
    limit: int,
    offset: int,
) -> tuple[list[SalesInvoiceListItem], int, Decimal, Decimal]:
    """Non-void invoices for a branch in [start_inclusive, end_exclusive), with aggregates."""
    br = await db.execute(
        select(Branch.id).where(Branch.id == branch_id, Branch.archived_at.is_(None)),
    )
    if br.scalar_one_or_none() is None:
        raise NotFoundError("Branch not found")

    filt = (
        SalesInvoice.branch_id == branch_id,
        SalesInvoice.created_at >= start_inclusive,
        SalesInvoice.created_at < end_exclusive,
        SalesInvoice.voided_at.is_(None),
    )

    agg_row = (
        await db.execute(
            select(
                func.count(SalesInvoice.id),
                func.coalesce(func.sum(SalesInvoice.subtotal), 0),
                func.coalesce(func.sum(SalesInvoice.total), 0),
            ).where(*filt),
        )
    ).one()
    total_count = int(agg_row[0] or 0)
    sum_subtotal = q2(Decimal(str(agg_row[1] or 0)))
    sum_total = q2(Decimal(str(agg_row[2] or 0)))

    inv_res = await db.execute(
        select(SalesInvoice, CustomerProfile)
        .outerjoin(CustomerProfile, SalesInvoice.customer_id == CustomerProfile.id)
        .where(*filt)
        .order_by(SalesInvoice.created_at.desc())
        .limit(limit)
        .offset(offset),
    )
    rows = inv_res.all()
    out: list[SalesInvoiceListItem] = []
    for inv, cust in rows:
        cust_disp: str | None = None
        if cust is not None:
            name = display_person_name(cust.first_name, cust.father_name, cust.family_name)
            cust_disp = name or (cust.phone or "").strip() or None
        out.append(
            SalesInvoiceListItem(
                id=inv.id,
                invoice_number=inv.invoice_number,
                invoice_barcode=inv.invoice_barcode,
                cart_id=inv.cart_id,
                terminal_id=inv.terminal_id,
                branch_id=inv.branch_id,
                customer_id=inv.customer_id,
                customer_display=cust_disp,
                subtotal=inv.subtotal,
                discount_total=inv.discount_total,
                tax_total=inv.tax_total,
                total=inv.total,
                created_at=inv.created_at,
            ),
        )
    return out, total_count, sum_subtotal, sum_total
