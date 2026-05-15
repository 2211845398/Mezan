"""Returns and exchanges service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.pos_cart import PosCart
from app.models.product import Product
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.models.sales_return import CreditNote, ExchangeLink, SalesReturn, SalesReturnLine
from app.schemas.sales_return import (
    ExchangeLinkDetailRead,
    ReturnEligibleLineRead,
    SalesInvoiceReturnLookupRead,
)
from app.services.cart_service import deduct_exchange_cart_for_return
from app.services.document_posting_service import post_sales_return_gl
from app.services.inventory_service import apply_stock_movement
from app.utils.money import q2

RETURN_ELIGIBLE_DAYS = 3


async def _assert_invoice_eligible_for_return(db: AsyncSession, invoice: SalesInvoice) -> None:
    """One return per invoice; only within RETURN_ELIGIBLE_DAYS of invoice time (UTC)."""
    cutoff = datetime.now(UTC) - timedelta(days=RETURN_ELIGIBLE_DAYS)
    if invoice.created_at < cutoff:
        raise ValidationError(
            f"Returns are only allowed within {RETURN_ELIGIBLE_DAYS} days of the invoice",
        )
    ret_chk = await db.execute(
        select(SalesReturn.id).where(SalesReturn.sales_invoice_id == invoice.id).limit(1)
    )
    if ret_chk.scalar_one_or_none() is not None:
        raise ValidationError("A return has already been recorded for this invoice")


async def create_return_and_credit(
    db: AsyncSession,
    *,
    invoice_barcode: str,
    lines: list[dict],
    reason: str | None,
    exchange_cart_id: int | None,
    user_id: int,
) -> tuple[SalesReturn, CreditNote]:
    ref = invoice_barcode.strip()
    if not ref:
        raise NotFoundError("Invoice not found")
    i_res = await db.execute(
        select(SalesInvoice).where(
            or_(SalesInvoice.invoice_barcode == ref, SalesInvoice.invoice_number == ref)
        )
    )
    invoice = i_res.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice not found")
    if invoice.voided_at is not None:
        raise ValidationError("Cannot return lines for a voided invoice")
    await _assert_invoice_eligible_for_return(db, invoice)
    inv_lines_res = await db.execute(
        select(SalesInvoiceLine).where(SalesInvoiceLine.sales_invoice_id == invoice.id)
    )
    inv_lines = {ln.id: ln for ln in inv_lines_res.scalars().all()}
    line_ids = list(inv_lines.keys())
    returned_map: dict[int, int] = {lid: 0 for lid in line_ids}
    if line_ids:
        ret_sum = await db.execute(
            select(SalesReturnLine.sales_invoice_line_id, func.sum(SalesReturnLine.qty))
            .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
            .where(
                SalesReturn.sales_invoice_id == invoice.id,
                SalesReturnLine.sales_invoice_line_id.in_(line_ids),
            )
            .group_by(SalesReturnLine.sales_invoice_line_id)
        )
        for lid, total in ret_sum.all():
            returned_map[int(lid)] = int(total or 0)
    if not lines:
        raise ValidationError("Return lines are required")
    ret = SalesReturn(
        sales_invoice_id=invoice.id,
        reason=reason,
        status="processed",
        created_by_user_id=user_id,
    )
    db.add(ret)
    await db.flush()
    total_refund = Decimal("0.00")
    gl_lines: list[tuple[int, int, Decimal, int]] = []
    for idx, item in enumerate(lines):
        inv_line = inv_lines.get(item["sales_invoice_line_id"])
        if not inv_line:
            raise ValidationError("Invalid sales_invoice_line_id")
        qty = item["qty"]
        already = returned_map.get(inv_line.id, 0)
        remaining = max(0, inv_line.qty - already)
        if qty <= 0 or qty > remaining:
            raise ValidationError("Invalid return qty")
        line_gross = q2(inv_line.line_total + inv_line.line_tax_amount)
        refund = q2(line_gross * Decimal(qty) / Decimal(inv_line.qty))
        total_refund += refund
        gl_lines.append((inv_line.product_id, qty, refund, inv_line.variant_id))
        db.add(
            SalesReturnLine(
                sales_return_id=ret.id,
                sales_invoice_line_id=inv_line.id,
                product_id=inv_line.product_id,
                variant_id=inv_line.variant_id,
                qty=qty,
                refund_amount=refund,
            )
        )
        await apply_stock_movement(
            db,
            idempotency_key=f"return:{ret.id}:line:{idx}",
            branch_id=invoice.branch_id,
            product_id=inv_line.product_id,
            qty_delta=qty,
            reason="return",
            ref_type="sales_return",
            ref_id=str(ret.id),
            variant_id=inv_line.variant_id,
        )
    credit = CreditNote(
        sales_return_id=ret.id,
        credit_number=f"CRN-{datetime.now(UTC).strftime('%Y%m%d')}-{ret.id}",
        total_amount=total_refund,
    )
    db.add(credit)
    deductions: list[tuple[int, int, int]] = []
    if exchange_cart_id is not None:
        xres = await db.execute(select(PosCart).where(PosCart.id == exchange_cart_id))
        ex_cart = xres.scalar_one_or_none()
        if not ex_cart:
            raise ValidationError("Exchange cart not found")
        if ex_cart.branch_id != invoice.branch_id:
            raise ValidationError(
                "Exchange cart must belong to the same branch as the original invoice"
            )
        ores = await db.execute(select(PosCart).where(PosCart.id == invoice.cart_id))
        orig_cart = ores.scalar_one_or_none()
        if orig_cart is not None and orig_cart.shift_id is not None:
            if ex_cart.shift_id != orig_cart.shift_id:
                raise ValidationError(
                    "Exchange cart must use the same POS shift as the original sale"
                )
        db.add(ExchangeLink(sales_return_id=ret.id, new_cart_id=exchange_cart_id))
        for item in lines:
            inv_line = inv_lines.get(item["sales_invoice_line_id"])
            if inv_line is None:
                continue
            deductions.append((inv_line.product_id, inv_line.variant_id, int(item["qty"])))
        await deduct_exchange_cart_for_return(
            db,
            cart_id=exchange_cart_id,
            deductions=deductions,
            created_by_user_id=user_id,
        )
    await post_sales_return_gl(
        db,
        branch_id=invoice.branch_id,
        credit_total=total_refund,
        sales_invoice_id=invoice.id,
        sales_return_id=ret.id,
        lines=gl_lines,
    )
    await db.commit()
    await db.refresh(ret)
    await db.refresh(credit)
    return ret, credit


async def lookup_sales_invoice_for_return(
    db: AsyncSession, *, invoice_ref: str
) -> SalesInvoiceReturnLookupRead:
    """Return invoice header and per-line remaining returnable quantities.

    ``invoice_ref`` may be the immutable ``invoice_barcode`` or the human-facing
    ``invoice_number`` (e.g. ``INV-MAIN-2026-000002``).
    """
    ref = invoice_ref.strip()
    if not ref:
        raise NotFoundError("Invoice not found")
    i_res = await db.execute(
        select(SalesInvoice).where(
            or_(SalesInvoice.invoice_barcode == ref, SalesInvoice.invoice_number == ref)
        )
    )
    invoice = i_res.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice not found")
    if invoice.voided_at is not None:
        raise ValidationError("Cannot return lines for a voided invoice")
    await _assert_invoice_eligible_for_return(db, invoice)

    inv_lines_res = await db.execute(
        select(SalesInvoiceLine).where(SalesInvoiceLine.sales_invoice_id == invoice.id)
    )
    inv_lines = list(inv_lines_res.scalars().all())
    line_ids = [ln.id for ln in inv_lines]

    returned_map: dict[int, int] = {lid: 0 for lid in line_ids}
    if line_ids:
        ret_sum = await db.execute(
            select(SalesReturnLine.sales_invoice_line_id, func.sum(SalesReturnLine.qty))
            .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
            .where(
                SalesReturn.sales_invoice_id == invoice.id,
                SalesReturnLine.sales_invoice_line_id.in_(line_ids),
            )
            .group_by(SalesReturnLine.sales_invoice_line_id)
        )
        for lid, total in ret_sum.all():
            returned_map[int(lid)] = int(total or 0)

    product_ids = {ln.product_id for ln in inv_lines}
    prods: dict[int, Product] = {}
    if product_ids:
        pres = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        prods = {p.id: p for p in pres.scalars().all()}

    eligible: list[ReturnEligibleLineRead] = []
    for ln in inv_lines:
        p = prods.get(ln.product_id)
        already = returned_map.get(ln.id, 0)
        remaining = max(0, ln.qty - already)
        eligible.append(
            ReturnEligibleLineRead(
                sales_invoice_line_id=ln.id,
                product_id=ln.product_id,
                variant_id=ln.variant_id,
                product_name=p.name if p else "",
                product_sku=p.sku if p else "",
                unit_price=ln.unit_price,
                qty_sold=ln.qty,
                qty_already_returned=already,
                qty_remaining=remaining,
            )
        )

    return SalesInvoiceReturnLookupRead(
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_barcode=invoice.invoice_barcode,
        branch_id=invoice.branch_id,
        lines=eligible,
    )


async def get_exchange_link_detail(db: AsyncSession, *, sales_return_id: int) -> ExchangeLinkDetailRead:
    link_res = await db.execute(
        select(ExchangeLink).where(ExchangeLink.sales_return_id == sales_return_id)
    )
    link = link_res.scalar_one_or_none()
    if not link:
        raise NotFoundError("No exchange is linked to this return")
    ret_res = await db.execute(select(SalesReturn).where(SalesReturn.id == sales_return_id))
    ret = ret_res.scalar_one_or_none()
    if not ret:
        raise NotFoundError("Return not found")
    inv_res = await db.execute(select(SalesInvoice).where(SalesInvoice.id == ret.sales_invoice_id))
    inv = inv_res.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found for this return")
    return ExchangeLinkDetailRead(
        sales_return_id=sales_return_id,
        new_cart_id=link.new_cart_id,
        original_sales_invoice_id=inv.id,
        original_invoice_number=inv.invoice_number,
        original_invoice_barcode=inv.invoice_barcode,
        branch_id=inv.branch_id,
        original_cart_id=inv.cart_id,
    )
