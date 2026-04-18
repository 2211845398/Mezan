"""Returns and exchanges service."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.models.sales_return import CreditNote, ExchangeLink, SalesReturn, SalesReturnLine
from app.services.document_posting_service import post_sales_return_gl
from app.services.inventory_service import apply_stock_movement
from app.utils.money import q2


async def create_return_and_credit(
    db: AsyncSession,
    *,
    invoice_barcode: str,
    lines: list[dict],
    reason: str | None,
    exchange_cart_id: int | None,
    user_id: int,
) -> tuple[SalesReturn, CreditNote]:
    i_res = await db.execute(
        select(SalesInvoice).where(SalesInvoice.invoice_barcode == invoice_barcode)
    )
    invoice = i_res.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice not found")
    inv_lines_res = await db.execute(
        select(SalesInvoiceLine).where(SalesInvoiceLine.sales_invoice_id == invoice.id)
    )
    inv_lines = {ln.id: ln for ln in inv_lines_res.scalars().all()}
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
    gl_lines: list[tuple[int, int, Decimal]] = []
    for idx, item in enumerate(lines):
        inv_line = inv_lines.get(item["sales_invoice_line_id"])
        if not inv_line:
            raise ValidationError("Invalid sales_invoice_line_id")
        qty = item["qty"]
        if qty <= 0 or qty > inv_line.qty:
            raise ValidationError("Invalid return qty")
        refund = q2(Decimal(str(inv_line.unit_price)) * qty)
        total_refund += refund
        gl_lines.append((inv_line.product_id, qty, refund))
        db.add(
            SalesReturnLine(
                sales_return_id=ret.id,
                sales_invoice_line_id=inv_line.id,
                product_id=inv_line.product_id,
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
        )
    credit = CreditNote(
        sales_return_id=ret.id,
        credit_number=f"CRN-{datetime.now(UTC).strftime('%Y%m%d')}-{ret.id}",
        total_amount=total_refund,
    )
    db.add(credit)
    if exchange_cart_id is not None:
        db.add(ExchangeLink(sales_return_id=ret.id, new_cart_id=exchange_cart_id))
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
