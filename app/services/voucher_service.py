"""Generic voucher posting service (Epic 19.4).

Unified engine for Receipt Vouchers, Payment Vouchers, and Expense Vouchers.
Maps entities (Customer, Supplier, Cash, Expense) to Chart of Accounts,
then posts double-entry journal records via post_journal_entry().
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.customer_profile import CustomerProfile
from app.models.suppliers import Supplier
from app.services.accounting_service import get_accounting_settings, post_journal_entry
from app.utils.money import q2


class VoucherType(str, Enum):
    """Supported voucher types."""
    RECEIPT = "receipt"      # Dr Cash/Bank, Cr AR/Customer
    PAYMENT = "payment"      # Dr AP/Supplier, Cr Cash/Bank
    EXPENSE = "expense"      # Dr Expense, Cr Cash/Bank
    TRANSFER = "transfer"    # Dr Bank, Cr Bank (internal transfer)
    JOURNAL = "journal"      # Generic: any debit → any credit


@dataclass(frozen=True)
class VoucherAccountSpec:
    """Specification for resolving an account from an entity reference."""
    account_type: Literal["customer", "supplier", "cash", "bank", "expense", "ar", "ap", "custom"]
    entity_id: int | None = None          # For customer/supplier lookups
    custom_account_id: int | None = None  # For explicit account selection


@dataclass
class VoucherLine:
    """Single line in a voucher (one side of the entry)."""
    spec: VoucherAccountSpec
    amount: Decimal
    memo: str = ""


async def _resolve_account_id(
    db: AsyncSession,
    settings,
    spec: VoucherAccountSpec,
) -> int:
    """Resolve a VoucherAccountSpec to a concrete chart_accounts.id.

    Rules:
    - customer: use customer.receivables_account_id or fall back to settings.default_ar_account_id
    - supplier: use supplier.payables_account_id or fall back to settings.default_ap_account_id
    - cash: use settings.default_cash_account_id
    - bank: use settings.default_cash_account_id (bank is treated as cash variant for now)
    - ar: use settings.default_ar_account_id
    - ap: use settings.default_ap_account_id
    - custom: use custom_account_id directly
    """
    if spec.account_type == "custom" and spec.custom_account_id:
        return spec.custom_account_id

    if spec.account_type in ("cash", "bank"):
        return settings.default_cash_account_id

    if spec.account_type == "ar":
        return settings.default_ar_account_id

    if spec.account_type == "ap":
        return settings.default_ap_account_id

    if spec.account_type == "customer":
        if not spec.entity_id:
            raise ValidationError("entity_id required for customer account resolution")
        cust_res = await db.execute(
            select(CustomerProfile).where(CustomerProfile.id == spec.entity_id)
        )
        customer = cust_res.scalar_one_or_none()
        if not customer:
            raise ValidationError(f"Customer {spec.entity_id} not found")
        return customer.receivables_account_id or settings.default_ar_account_id

    if spec.account_type == "supplier":
        if not spec.entity_id:
            raise ValidationError("entity_id required for supplier account resolution")
        sup_res = await db.execute(
            select(Supplier).where(Supplier.id == spec.entity_id)
        )
        supplier = sup_res.scalar_one_or_none()
        if not supplier:
            raise ValidationError(f"Supplier {spec.entity_id} not found")
        return supplier.payables_account_id or settings.default_ap_account_id

    if spec.account_type == "expense":
        if not spec.custom_account_id:
            raise ValidationError("custom_account_id required for expense account")
        return spec.custom_account_id

    raise ValidationError(f"Cannot resolve account for spec: {spec}")


async def post_voucher_gl(
    db: AsyncSession,
    *,
    voucher_type: VoucherType,
    debit: VoucherLine,
    credit: VoucherLine,
    entry_date: date,
    description: str,
    reference: str | None = None,
    branch_id: int,
    user_id: int | None = None,
    idempotency_key: str | None = None,
    currency_code: str | None = None,
    fx_rate: Decimal | None = None,
) -> dict:
    """Post a generic double-entry voucher to the GL.

    Args:
        voucher_type: RECEIPT, PAYMENT, EXPENSE, TRANSFER, or JOURNAL
        debit: Debit side specification (account + amount)
        credit: Credit side specification (account + amount)
        entry_date: Journal entry date
        description: Entry description
        reference: Optional external reference number
        branch_id: Branch for accounting
        user_id: Optional user ID for audit trail
        idempotency_key: Optional idempotency key (auto-generated if not provided)
        currency_code: Optional transaction currency (defaults to base)
        fx_rate: Optional FX rate to base currency

    Returns:
        Dict with journal_entry_id, status, and message.

    Raises:
        ValidationError: If amounts don't match, accounts invalid, or period closed.
    """
    # Normalize amounts
    dr_amt = q2(debit.amount)
    cr_amt = q2(credit.amount)

    if dr_amt <= 0 or cr_amt <= 0:
        raise ValidationError("Voucher amounts must be positive", details={"debit": str(dr_amt), "credit": str(cr_amt)})

    if dr_amt != cr_amt:
        raise ValidationError(
            "Debit and credit amounts must match",
            details={"debit": str(dr_amt), "credit": str(cr_amt)},
        )

    # Load settings for account resolution
    settings = await get_accounting_settings(db)

    # Resolve both accounts
    debit_account_id = await _resolve_account_id(db, settings, debit.spec)
    credit_account_id = await _resolve_account_id(db, settings, credit.spec)

    # Build idempotency key if not provided
    if not idempotency_key:
        idempotency_key = f"voucher:{voucher_type}:{branch_id}:{entry_date.isoformat()}:{dr_amt}:{debit_account_id}:{credit_account_id}"
        if reference:
            idempotency_key += f":{reference}"

    # Build journal entry lines
    lines = [
        {
            "account_id": debit_account_id,
            "branch_id": branch_id,
            "debit": dr_amt,
            "credit": Decimal("0"),
            "memo": debit.memo or f"{voucher_type.value} - debit",
        },
        {
            "account_id": credit_account_id,
            "branch_id": branch_id,
            "debit": Decimal("0"),
            "credit": cr_amt,
            "memo": credit.memo or f"{voucher_type.value} - credit",
        },
    ]

    # Post the journal entry
    je = await post_journal_entry(
        db,
        entry_date=entry_date,
        description=description[:512],
        source_type=f"voucher_{voucher_type.value}",
        source_id=reference or str(idempotency_key),
        idempotency_key=idempotency_key,
        lines=lines,
    )

    if je is None:
        return {
            "status": "duplicate",
            "message": "Voucher already posted (idempotency key matched)",
            "idempotency_key": idempotency_key,
        }

    return {
        "status": "posted",
        "journal_entry_id": je.id,
        "idempotency_key": idempotency_key,
        "message": f"{voucher_type.value.title()} voucher posted successfully",
        "debit_account_id": debit_account_id,
        "credit_account_id": credit_account_id,
        "amount": str(dr_amt),
    }


# Convenience wrappers for specific voucher types


async def post_receipt_voucher(
    db: AsyncSession,
    *,
    customer_id: int | None,
    cash_account_id: int | None = None,
    amount: Decimal,
    entry_date: date,
    description: str,
    reference: str | None = None,
    branch_id: int,
    memo: str = "",
) -> dict:
    """Receipt Voucher: Dr Cash, Cr Customer AR.

    Args:
        customer_id: Customer receiving the receipt (AR cleared)
        cash_account_id: Optional specific cash/bank account (defaults to settings)
        amount: Receipt amount
        entry_date: Entry date
        description: Description
        reference: Optional reference number
        branch_id: Branch
        memo: Optional line memo
    """
    cash_spec = VoucherAccountSpec(
        account_type="custom" if cash_account_id else "cash",
        custom_account_id=cash_account_id,
    )
    ar_spec = VoucherAccountSpec(
        account_type="customer",
        entity_id=customer_id,
    )

    return await post_voucher_gl(
        db,
        voucher_type=VoucherType.RECEIPT,
        debit=VoucherLine(spec=cash_spec, amount=amount, memo=memo or "Cash/Bank receipt"),
        credit=VoucherLine(spec=ar_spec, amount=amount, memo=memo or "Clear customer AR"),
        entry_date=entry_date,
        description=description,
        reference=reference,
        branch_id=branch_id,
    )


async def post_payment_voucher(
    db: AsyncSession,
    *,
    supplier_id: int | None,
    cash_account_id: int | None = None,
    amount: Decimal,
    entry_date: date,
    description: str,
    reference: str | None = None,
    branch_id: int,
    memo: str = "",
) -> dict:
    """Payment Voucher: Dr Supplier AP, Cr Cash.

    Args:
        supplier_id: Supplier being paid (AP cleared)
        cash_account_id: Optional specific cash/bank account (defaults to settings)
        amount: Payment amount
        entry_date: Entry date
        description: Description
        reference: Optional reference number
        branch_id: Branch
        memo: Optional line memo
    """
    ap_spec = VoucherAccountSpec(
        account_type="supplier",
        entity_id=supplier_id,
    )
    cash_spec = VoucherAccountSpec(
        account_type="custom" if cash_account_id else "cash",
        custom_account_id=cash_account_id,
    )

    return await post_voucher_gl(
        db,
        voucher_type=VoucherType.PAYMENT,
        debit=VoucherLine(spec=ap_spec, amount=amount, memo=memo or "Clear supplier AP"),
        credit=VoucherLine(spec=cash_spec, amount=amount, memo=memo or "Cash/Bank payment"),
        entry_date=entry_date,
        description=description,
        reference=reference,
        branch_id=branch_id,
    )


async def post_expense_voucher(
    db: AsyncSession,
    *,
    expense_account_id: int,
    cash_account_id: int | None = None,
    amount: Decimal,
    entry_date: date,
    description: str,
    reference: str | None = None,
    branch_id: int,
    memo: str = "",
) -> dict:
    """Expense Voucher: Dr Expense, Cr Cash.

    Args:
        expense_account_id: Chart of Accounts expense account to debit
        cash_account_id: Optional specific cash/bank account (defaults to settings)
        amount: Expense amount
        entry_date: Entry date
        description: Description
        reference: Optional reference number
        branch_id: Branch
        memo: Optional line memo
    """
    expense_spec = VoucherAccountSpec(
        account_type="expense",
        custom_account_id=expense_account_id,
    )
    cash_spec = VoucherAccountSpec(
        account_type="custom" if cash_account_id else "cash",
        custom_account_id=cash_account_id,
    )

    return await post_voucher_gl(
        db,
        voucher_type=VoucherType.EXPENSE,
        debit=VoucherLine(spec=expense_spec, amount=amount, memo=memo or "Expense"),
        credit=VoucherLine(spec=cash_spec, amount=amount, memo=memo or "Cash/Bank payment"),
        entry_date=entry_date,
        description=description,
        reference=reference,
        branch_id=branch_id,
    )


async def post_internal_transfer(
    db: AsyncSession,
    *,
    from_cash_account_id: int,
    to_cash_account_id: int,
    amount: Decimal,
    entry_date: date,
    description: str,
    reference: str | None = None,
    branch_id: int,
    memo: str = "",
) -> dict:
    """Internal Cash/Bank Transfer: Dr To-Account, Cr From-Account.

    Args:
        from_cash_account_id: Source cash/bank account
        to_cash_account_id: Destination cash/bank account
        amount: Transfer amount
        entry_date: Entry date
        description: Description
        reference: Optional reference number
        branch_id: Branch
        memo: Optional line memo
    """
    to_spec = VoucherAccountSpec(
        account_type="custom",
        custom_account_id=to_cash_account_id,
    )
    from_spec = VoucherAccountSpec(
        account_type="custom",
        custom_account_id=from_cash_account_id,
    )

    return await post_voucher_gl(
        db,
        voucher_type=VoucherType.TRANSFER,
        debit=VoucherLine(spec=to_spec, amount=amount, memo=memo or "Transfer to"),
        credit=VoucherLine(spec=from_spec, amount=amount, memo=memo or "Transfer from"),
        entry_date=entry_date,
        description=description,
        reference=reference,
        branch_id=branch_id,
    )
