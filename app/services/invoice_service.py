"""Finalize checkout into immutable invoice."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, StateTransitionError
from app.models.pos_cart import PosCart, PosCartLine
from app.models.pos_payment import PaymentIntent
from app.models.sales_invoice import InvoicePayment, SalesInvoice, SalesInvoiceLine
from app.services.document_posting_service import post_sales_invoice_gl
from app.services.inventory_service import apply_stock_movement
from app.services.numbering_service import next_sales_invoice_number


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
    if payment_intent.status != "succeeded":
        raise StateTransitionError("Payment is not completed")
    line_res = await db.execute(select(PosCartLine).where(PosCartLine.cart_id == cart.id))
    lines = line_res.scalars().all()
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
        total=cart.total,
        created_by_user_id=user_id,
        created_at=issued_at,
    )
    db.add(invoice)
    await db.flush()

    for idx, ln in enumerate(lines):
        db.add(
            SalesInvoiceLine(
                sales_invoice_id=invoice.id,
                product_id=ln.product_id,
                qty=ln.qty,
                unit_price=ln.unit_price,
                line_total=ln.line_total,
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
        )
    db.add(
        InvoicePayment(
            sales_invoice_id=invoice.id,
            payment_intent_id=payment_intent.id,
            amount=payment_intent.amount,
            method=payment_intent.provider,
            reference=payment_intent.external_id,
        )
    )
    sil_res = await db.execute(
        select(SalesInvoiceLine).where(SalesInvoiceLine.sales_invoice_id == invoice.id)
    )
    await post_sales_invoice_gl(db, invoice=invoice, lines=list(sil_res.scalars().all()))
    cart.status = "paid"
    cart.paid_at = issued_at
    await db.commit()
    await db.refresh(invoice)
    return invoice
