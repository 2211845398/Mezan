"""Post operational documents to the GL (Epic 5.3)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goods_receipt import GoodsReceipt
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.payslip import Payslip
from app.models.sales_invoice import InvoicePayment, SalesInvoice, SalesInvoiceLine
from app.models.suppliers import Supplier
from app.services.accounting_service import get_accounting_settings, post_journal_entry
from app.services.inventory_valuation_service import get_unit_costs_for_sale
from app.utils.money import q2


def _normalize_tender(method: str | None) -> str:
    if method in ("cash", "card", "other"):
        return method
    return "cash"


def _settlement_account_id(settings, tender: str) -> int:
    if tender == "card":
        return settings.default_card_clearing_account_id
    if tender == "other":
        return settings.default_other_clearing_account_id
    return settings.default_cash_account_id


async def _first_invoice_payment_tender(db: AsyncSession, invoice_id: int) -> str:
    res = await db.execute(
        select(InvoicePayment.method).where(InvoicePayment.sales_invoice_id == invoice_id).limit(1)
    )
    row = res.scalar_one_or_none()
    return _normalize_tender(row)


async def post_sales_invoice_gl(
    db: AsyncSession,
    *,
    invoice: SalesInvoice,
    lines: list[SalesInvoiceLine],
) -> None:
    """POS sale: settlement (walk-in) or AR accrual (on account), revenue + discounts, COGS."""
    settings = await get_accounting_settings(db)
    total = q2(invoice.total)
    if total <= 0:
        return

    branch_id = invoice.branch_id
    entry_date = invoice.created_at.date() if invoice.created_at else date.today()
    subtotal = q2(invoice.subtotal)
    tax_amt = q2(invoice.tax_total)
    disc_debit = q2(subtotal + tax_amt - total)
    if disc_debit < 0:
        disc_debit = Decimal("0")

    cogs_total = Decimal("0")
    unit_costs = await get_unit_costs_for_sale(
        db,
        branch_id=branch_id,
        product_ids=[ln.product_id for ln in lines],
    )
    for ln in lines:
        uc = unit_costs.get(ln.product_id, Decimal("0"))
        cogs_total += q2(uc * Decimal(ln.qty))

    async def post_revenue_and_cash() -> None:
        if invoice.customer_id is None:
            tender = await _first_invoice_payment_tender(db, invoice.id)
            settle_id = _settlement_account_id(settings, tender)
            lines_payload: list[dict] = [
                {
                    "account_id": settle_id,
                    "branch_id": branch_id,
                    "debit": total,
                    "credit": Decimal("0"),
                    "memo": f"POS sale ({tender})",
                },
                {
                    "account_id": settings.default_sales_revenue_account_id,
                    "branch_id": branch_id,
                    "debit": Decimal("0"),
                    "credit": subtotal,
                    "memo": "Sales revenue",
                },
            ]
            if disc_debit > 0:
                lines_payload.append(
                    {
                        "account_id": settings.default_sales_discount_account_id,
                        "branch_id": branch_id,
                        "debit": disc_debit,
                        "credit": Decimal("0"),
                        "memo": "Sales discounts",
                    }
                )
            if tax_amt > 0:
                lines_payload.append(
                    {
                        "account_id": settings.default_output_tax_payable_account_id,
                        "branch_id": branch_id,
                        "debit": Decimal("0"),
                        "credit": tax_amt,
                        "memo": "Output VAT",
                    }
                )
            if cogs_total > 0:
                lines_payload.extend(
                    [
                        {
                            "account_id": settings.default_cogs_account_id,
                            "branch_id": branch_id,
                            "debit": cogs_total,
                            "credit": Decimal("0"),
                            "memo": "COGS",
                        },
                        {
                            "account_id": settings.default_inventory_account_id,
                            "branch_id": branch_id,
                            "debit": Decimal("0"),
                            "credit": cogs_total,
                            "memo": "Inventory",
                        },
                    ]
                )
            await post_journal_entry(
                db,
                entry_date=entry_date,
                description=f"Sales invoice {invoice.invoice_number}",
                source_type="sales_invoice",
                source_id=str(invoice.id),
                idempotency_key=f"sales_invoice:{invoice.id}:pos_cash",
                lines=lines_payload,
            )
            return

        ar_account = settings.default_ar_account_id
        lines_payload = [
            {
                "account_id": ar_account,
                "branch_id": branch_id,
                "debit": total,
                "credit": Decimal("0"),
                "memo": "AR accrual",
            },
            {
                "account_id": settings.default_sales_revenue_account_id,
                "branch_id": branch_id,
                "debit": Decimal("0"),
                "credit": subtotal,
                "memo": "Sales revenue",
            },
        ]
        if disc_debit > 0:
            lines_payload.append(
                {
                    "account_id": settings.default_sales_discount_account_id,
                    "branch_id": branch_id,
                    "debit": disc_debit,
                    "credit": Decimal("0"),
                    "memo": "Sales discounts",
                }
            )
        if tax_amt > 0:
            lines_payload.append(
                {
                    "account_id": settings.default_output_tax_payable_account_id,
                    "branch_id": branch_id,
                    "debit": Decimal("0"),
                    "credit": tax_amt,
                    "memo": "Output VAT",
                }
            )
        await post_journal_entry(
            db,
            entry_date=entry_date,
            description=f"Sales invoice {invoice.invoice_number} accrual",
            source_type="sales_invoice",
            source_id=str(invoice.id),
            idempotency_key=f"sales_invoice:{invoice.id}:accrual",
            lines=lines_payload,
        )
        if cogs_total > 0:
            await post_journal_entry(
                db,
                entry_date=entry_date,
                description=f"COGS {invoice.invoice_number}",
                source_type="sales_invoice",
                source_id=str(invoice.id),
                idempotency_key=f"sales_invoice:{invoice.id}:cogs",
                lines=[
                    {
                        "account_id": settings.default_cogs_account_id,
                        "branch_id": branch_id,
                        "debit": cogs_total,
                        "credit": Decimal("0"),
                        "memo": "COGS",
                    },
                    {
                        "account_id": settings.default_inventory_account_id,
                        "branch_id": branch_id,
                        "debit": Decimal("0"),
                        "credit": cogs_total,
                        "memo": "Inventory",
                    },
                ],
            )

    await post_revenue_and_cash()


async def post_sales_return_gl(
    db: AsyncSession,
    *,
    branch_id: int,
    credit_total: Decimal,
    sales_invoice_id: int,
    sales_return_id: int,
    lines: list[tuple[int, int, Decimal]],
) -> None:
    """Reverse revenue/discount and credit original settlement for a processed return."""
    if credit_total <= 0:
        return
    settings = await get_accounting_settings(db)
    entry_date = date.today()
    total = q2(credit_total)

    cogs_back = Decimal("0")
    unit_costs = await get_unit_costs_for_sale(
        db,
        branch_id=branch_id,
        product_ids=[product_id for product_id, _qty, _ref in lines],
    )
    for product_id, qty, _ref in lines:
        uc = unit_costs.get(product_id, Decimal("0"))
        cogs_back += q2(uc * Decimal(qty))

    inv_res = await db.execute(select(SalesInvoice).where(SalesInvoice.id == sales_invoice_id))
    orig = inv_res.scalar_one_or_none()
    if orig and orig.customer_id is not None:
        settle_id = settings.default_ar_account_id
    else:
        tender = await _first_invoice_payment_tender(db, sales_invoice_id)
        settle_id = _settlement_account_id(settings, tender)

    inv_total = q2(orig.total) if orig else total
    inv_sub = q2(orig.subtotal) if orig else total
    inv_disc = q2(orig.discount_total) if orig else Decimal("0")
    inv_tax = q2(orig.tax_total) if orig else Decimal("0")

    if orig and inv_total > 0:
        rev_dr = q2(inv_sub * total / inv_total)
        disc_cr = q2(inv_disc * total / inv_total)
        tax_dr = q2(inv_tax * total / inv_total)
    else:
        rev_dr = total
        disc_cr = Decimal("0")
        tax_dr = Decimal("0")

    adj = q2(rev_dr - disc_cr + tax_dr - total)
    rev_dr = q2(rev_dr - adj)

    rev_lines: list[dict] = [
        {
            "account_id": settings.default_sales_revenue_account_id,
            "branch_id": branch_id,
            "debit": rev_dr,
            "credit": Decimal("0"),
            "memo": "Return — revenue reversal",
        },
    ]
    if disc_cr > 0:
        rev_lines.append(
            {
                "account_id": settings.default_sales_discount_account_id,
                "branch_id": branch_id,
                "debit": Decimal("0"),
                "credit": disc_cr,
                "memo": "Return — sales discount reversal",
            }
        )
    if tax_dr > 0:
        rev_lines.append(
            {
                "account_id": settings.default_output_tax_payable_account_id,
                "branch_id": branch_id,
                "debit": tax_dr,
                "credit": Decimal("0"),
                "memo": "Return — output VAT reversal",
            }
        )
    rev_lines.append(
        {
            "account_id": settle_id,
            "branch_id": branch_id,
            "debit": Decimal("0"),
            "credit": total,
            "memo": "Return — settlement (counter)",
        }
    )
    await post_journal_entry(
        db,
        entry_date=entry_date,
        description=f"Sales return {sales_return_id}",
        source_type="sales_return",
        source_id=str(sales_return_id),
        idempotency_key=f"sales_return:{sales_return_id}:revenue",
        lines=rev_lines,
    )
    if cogs_back > 0:
        await post_journal_entry(
            db,
            entry_date=entry_date,
            description=f"COGS restore {sales_return_id}",
            source_type="sales_return",
            source_id=str(sales_return_id),
            idempotency_key=f"sales_return:{sales_return_id}:cogs",
            lines=[
                {
                    "account_id": settings.default_inventory_account_id,
                    "branch_id": branch_id,
                    "debit": cogs_back,
                    "credit": Decimal("0"),
                    "memo": "Inventory restore",
                },
                {
                    "account_id": settings.default_cogs_account_id,
                    "branch_id": branch_id,
                    "debit": Decimal("0"),
                    "credit": cogs_back,
                    "memo": "COGS reversal",
                },
            ],
        )


async def post_ar_cash_receipt_gl(
    db: AsyncSession,
    *,
    branch_id: int,
    amount: Decimal,
    application_id: int,
    entry_date: date,
) -> None:
    """Dr Cash, Cr AR when an AR open item is collected. Idempotent per application."""
    settings = await get_accounting_settings(db)
    amt = q2(amount)
    if amt <= 0:
        return
    await post_journal_entry(
        db,
        entry_date=entry_date,
        description=f"AR cash receipt (application {application_id})",
        source_type="ar_payment_application",
        source_id=str(application_id),
        idempotency_key=f"ar_payment_application:{application_id}",
        lines=[
            {
                "account_id": settings.default_cash_account_id,
                "branch_id": branch_id,
                "debit": amt,
                "credit": Decimal("0"),
                "memo": "Cash received on account",
            },
            {
                "account_id": settings.default_ar_account_id,
                "branch_id": branch_id,
                "debit": Decimal("0"),
                "credit": amt,
                "memo": "Clear AR",
            },
        ],
    )


async def post_goods_receipt_gl(db: AsyncSession, *, receipt: GoodsReceipt) -> None:
    """Dr Inventory, Cr AP for validated goods receipt."""
    settings = await get_accounting_settings(db)
    res = await db.execute(
        select(GoodsReceiptLine).where(GoodsReceiptLine.goods_receipt_id == receipt.id)
    )
    gr_lines = list(res.scalars().all())
    if not gr_lines:
        return

    total_ext = Decimal("0")
    for ln in gr_lines:
        total_ext += q2(ln.unit_cost * Decimal(ln.qty))

    if total_ext <= 0:
        return

    ap_account = settings.default_ap_account_id
    if receipt.supplier_id:
        sres = await db.execute(select(Supplier).where(Supplier.id == receipt.supplier_id))
        sup = sres.scalar_one_or_none()
        if sup and sup.payables_account_id:
            ap_account = sup.payables_account_id

    entry_date = receipt.created_at.date() if receipt.created_at else date.today()
    await post_journal_entry(
        db,
        entry_date=entry_date,
        description=f"Goods receipt {receipt.id}",
        source_type="goods_receipt",
        source_id=str(receipt.id),
        idempotency_key=f"goods_receipt:{receipt.id}:ap_inventory",
        lines=[
            {
                "account_id": settings.default_inventory_account_id,
                "branch_id": receipt.branch_id,
                "debit": total_ext,
                "credit": Decimal("0"),
                "memo": "Inventory receipt",
            },
            {
                "account_id": ap_account,
                "branch_id": receipt.branch_id,
                "debit": Decimal("0"),
                "credit": total_ext,
                "memo": "Accounts payable",
            },
        ],
    )


async def post_payslip_approved_gl(db: AsyncSession, *, payslip: Payslip, branch_id: int) -> None:
    """Dr salary expense (gross), Cr deductions payable + payroll liability (net)."""
    settings = await get_accounting_settings(db)
    gross = q2(payslip.gross_amount)
    ded = q2(payslip.deductions)
    net = q2(payslip.net_amount)
    if gross <= 0:
        return

    entry_date = payslip.period_end
    lines = [
        {
            "account_id": settings.default_salary_expense_account_id,
            "branch_id": branch_id,
            "debit": gross,
            "credit": Decimal("0"),
            "memo": "Salary expense",
        },
    ]
    if ded > 0:
        lines.append(
            {
                "account_id": settings.default_payroll_deductions_payable_account_id,
                "branch_id": branch_id,
                "debit": Decimal("0"),
                "credit": ded,
                "memo": "Deductions payable",
            }
        )
    lines.append(
        {
            "account_id": settings.default_payroll_liability_account_id,
            "branch_id": branch_id,
            "debit": Decimal("0"),
            "credit": net,
            "memo": "Net payroll payable",
        }
    )

    await post_journal_entry(
        db,
        entry_date=entry_date,
        description=f"Payslip {payslip.id} approved",
        source_type="payslip",
        source_id=str(payslip.id),
        idempotency_key=f"payslip:{payslip.id}:payroll_expense",
        lines=lines,
    )
