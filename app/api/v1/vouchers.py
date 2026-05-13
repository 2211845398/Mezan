"""Voucher API endpoints (Epic 19.4).

Unified backend posting engine for Receipt Vouchers, Payment Vouchers,
Expenses, and Internal Transfers. Frontend forms map to these endpoints
which call the generic post_voucher_gl() engine.
"""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.vouchers import (
    ExpenseVoucherCreate,
    InternalTransferCreate,
    PaymentVoucherCreate,
    ReceiptVoucherCreate,
    VoucherRead,
)
from app.services import audit_service
from app.services.voucher_service import (
    post_expense_voucher,
    post_internal_transfer,
    post_payment_voucher,
    post_receipt_voucher,
)

router = APIRouter()


@router.post(
    "/accounting/vouchers/receipt",
    response_model=VoucherRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_receipt_voucher(
    body: ReceiptVoucherCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
) -> VoucherRead:
    """Create a Receipt Voucher: Dr Cash, Cr Customer AR.

    Records cash received from a customer (or other debtor).
    """
    result = await post_receipt_voucher(
        db,
        customer_id=body.customer_id,
        cash_account_id=body.cash_account_id,
        amount=body.amount,
        entry_date=body.entry_date,
        description=body.description,
        reference=body.reference or f"RV-{body.entry_date.isoformat()}",
        branch_id=body.branch_id,
        memo=body.memo,
        idempotency_key=body.idempotency_key,
    )

    await audit_service.log(
        session=db,
        action="voucher.receipt_created",
        resource_type="journal_entry",
        resource_id=str(result.get("journal_entry_id", "")),
        user_id=current_user.id,
        request=request,
        details={
            "customer_id": body.customer_id,
            "amount": str(body.amount),
            "branch_id": body.branch_id,
        },
    )
    await db.commit()

    return VoucherRead(
        status="posted",
        journal_entry_id=result.get("journal_entry_id"),
        idempotency_key=body.idempotency_key or f"rv-{result.get('journal_entry_id', '0')}",
        message="Receipt voucher posted successfully",
        debit_account_id=result.get("debit_account_id"),
        credit_account_id=result.get("credit_account_id"),
        amount=str(body.amount),
    )


@router.post(
    "/accounting/vouchers/payment",
    response_model=VoucherRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment_voucher(
    body: PaymentVoucherCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
) -> VoucherRead:
    """Create a Payment Voucher: Dr Supplier AP, Cr Cash.

    Records cash paid to a supplier (or other creditor).
    """
    result = await post_payment_voucher(
        db,
        supplier_id=body.supplier_id,
        cash_account_id=body.cash_account_id,
        amount=body.amount,
        entry_date=body.entry_date,
        description=body.description,
        reference=body.reference or f"PV-{body.entry_date.isoformat()}",
        branch_id=body.branch_id,
        memo=body.memo,
        idempotency_key=body.idempotency_key,
    )

    await audit_service.log(
        session=db,
        action="voucher.payment_created",
        resource_type="journal_entry",
        resource_id=str(result.get("journal_entry_id", "")),
        user_id=current_user.id,
        request=request,
        details={
            "supplier_id": body.supplier_id,
            "amount": str(body.amount),
            "branch_id": body.branch_id,
        },
    )
    await db.commit()

    return VoucherRead(
        status="posted",
        journal_entry_id=result.get("journal_entry_id"),
        idempotency_key=body.idempotency_key or f"pv-{result.get('journal_entry_id', '0')}",
        message="Payment voucher posted successfully",
        debit_account_id=result.get("debit_account_id"),
        credit_account_id=result.get("credit_account_id"),
        amount=str(body.amount),
    )


@router.post(
    "/accounting/vouchers/expense",
    response_model=VoucherRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_expense_voucher(
    body: ExpenseVoucherCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
) -> VoucherRead:
    """Create an Expense Voucher: Dr Expense Account, Cr Cash.

    Records a direct expense payment.
    """
    result = await post_expense_voucher(
        db,
        expense_account_id=body.expense_account_id,
        cash_account_id=body.cash_account_id,
        amount=body.amount,
        entry_date=body.entry_date,
        description=body.description,
        reference=body.reference or f"EV-{body.entry_date.isoformat()}",
        branch_id=body.branch_id,
        memo=body.memo,
        idempotency_key=body.idempotency_key,
    )

    await audit_service.log(
        session=db,
        action="voucher.expense_created",
        resource_type="journal_entry",
        resource_id=str(result.get("journal_entry_id", "")),
        user_id=current_user.id,
        request=request,
        details={
            "expense_account": body.expense_account_id,
            "amount": str(body.amount),
            "branch_id": body.branch_id,
        },
    )
    await db.commit()

    return VoucherRead(
        status="posted",
        journal_entry_id=result.get("journal_entry_id"),
        idempotency_key=body.idempotency_key or f"ev-{result.get('journal_entry_id', '0')}",
        message="Expense voucher posted successfully",
        debit_account_id=result.get("debit_account_id"),
        credit_account_id=result.get("credit_account_id"),
        amount=str(body.amount),
    )


@router.post(
    "/accounting/vouchers/transfer",
    response_model=VoucherRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_internal_transfer(
    body: InternalTransferCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
) -> VoucherRead:
    """Create an Internal Transfer: Dr Destination, Cr Source.

    Records movement between cash/bank accounts.
    """
    result = await post_internal_transfer(
        db,
        from_cash_account_id=body.from_cash_account_id,
        to_cash_account_id=body.to_cash_account_id,
        amount=body.amount,
        entry_date=body.entry_date,
        description=body.description,
        reference=body.reference or f"TR-{body.entry_date.isoformat()}",
        branch_id=body.branch_id,
        memo=body.memo,
        idempotency_key=body.idempotency_key,
    )

    await audit_service.log(
        session=db,
        action="voucher.transfer_created",
        resource_type="journal_entry",
        resource_id=str(result.get("journal_entry_id", "")),
        user_id=current_user.id,
        request=request,
        details={
            "from_account": body.from_cash_account_id,
            "to_account": body.to_cash_account_id,
            "amount": str(body.amount),
            "branch_id": body.branch_id,
        },
    )
    await db.commit()

    return VoucherRead(
        status="posted",
        journal_entry_id=result.get("journal_entry_id"),
        idempotency_key=body.idempotency_key or f"tr-{result.get('journal_entry_id', '0')}",
        message="Internal transfer posted successfully",
        debit_account_id=result.get("debit_account_id"),
        credit_account_id=result.get("credit_account_id"),
        amount=str(body.amount),
    )
