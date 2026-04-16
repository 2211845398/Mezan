"""Post operational documents to the GL (Epic 5.3)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goods_receipt import GoodsReceipt
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.payslip import Payslip
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.models.suppliers import Supplier
from app.services.accounting_service import get_accounting_settings, post_journal_entry
from app.services.inventory_valuation_service import get_unit_cost_for_sale


def _d(x: float | Decimal) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"))


async def post_sales_invoice_gl(
    db: AsyncSession,
    *,
    invoice: SalesInvoice,
    lines: list[SalesInvoiceLine],
) -> None:
    """POS sale: revenue + cash/AR pattern and COGS (WAVG). Idempotent per invoice."""
    settings = await get_accounting_settings(db)
    total = _d(invoice.total)
    if total <= 0:
        return

    branch_id = invoice.branch_id
    entry_date = invoice.created_at.date() if invoice.created_at else date.today()

    # COGS extension
    cogs_total = Decimal("0")
    for ln in lines:
        uc = await get_unit_cost_for_sale(db, branch_id=branch_id, product_id=ln.product_id)
        cogs_total += _d(uc * Decimal(ln.qty))

    async def post_revenue_and_cash() -> None:
        if invoice.customer_id is None:
            lines_payload = [
                {
                    "account_id": settings.default_cash_account_id,
                    "branch_id": branch_id,
                    "debit": total,
                    "credit": Decimal("0"),
                    "memo": "POS cash sale",
                },
                {
                    "account_id": settings.default_sales_revenue_account_id,
                    "branch_id": branch_id,
                    "debit": Decimal("0"),
                    "credit": total,
                    "memo": "Sales revenue",
                },
            ]
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

        # Account customer: AR accrual + cash clearing (payment already captured)
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
                "credit": total,
                "memo": "Sales revenue",
            },
        ]
        await post_journal_entry(
            db,
            entry_date=entry_date,
            description=f"Sales invoice {invoice.invoice_number} accrual",
            source_type="sales_invoice",
            source_id=str(invoice.id),
            idempotency_key=f"sales_invoice:{invoice.id}:accrual",
            lines=lines_payload,
        )
        cash_lines = [
            {
                "account_id": settings.default_cash_account_id,
                "branch_id": branch_id,
                "debit": total,
                "credit": Decimal("0"),
                "memo": "Cash receipt",
            },
            {
                "account_id": ar_account,
                "branch_id": branch_id,
                "debit": Decimal("0"),
                "credit": total,
                "memo": "Clear AR",
            },
        ]
        await post_journal_entry(
            db,
            entry_date=entry_date,
            description=f"Sales invoice {invoice.invoice_number} cash",
            source_type="sales_invoice",
            source_id=str(invoice.id),
            idempotency_key=f"sales_invoice:{invoice.id}:cash",
            lines=cash_lines,
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
    """Reverse revenue and restore COGS for a processed return. lines: (product_id, qty, refund)."""
    if credit_total <= 0:
        return
    settings = await get_accounting_settings(db)
    entry_date = date.today()
    total = _d(credit_total)

    cogs_back = Decimal("0")
    for product_id, qty, _ref in lines:
        uc = await get_unit_cost_for_sale(db, branch_id=branch_id, product_id=product_id)
        cogs_back += _d(uc * Decimal(qty))

    rev_lines = [
        {
            "account_id": settings.default_sales_revenue_account_id,
            "branch_id": branch_id,
            "debit": total,
            "credit": Decimal("0"),
            "memo": "Return — revenue reversal",
        },
        {
            "account_id": settings.default_cash_account_id,
            "branch_id": branch_id,
            "debit": Decimal("0"),
            "credit": total,
            "memo": "Return — cash (counter)",
        },
    ]
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
        total_ext += _d(Decimal(str(ln.unit_cost)) * Decimal(ln.qty))

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
    gross = _d(payslip.gross_amount)
    ded = _d(payslip.deductions)
    net = _d(payslip.net_amount)
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
