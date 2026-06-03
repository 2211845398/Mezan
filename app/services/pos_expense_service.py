"""POS expense recording with GL posting (Epic 21.4)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.accounting_settings import AccountingSettings
from app.models.chart_accounts import ChartAccount
from app.models.pos_expense import PosExpense
from app.models.pos_shift import PosShift
from app.services import shift_service
from app.services.voucher_service import post_expense_voucher


async def record_pos_expense(
    db: AsyncSession,
    *,
    shift_id: int,
    expense_category: str,
    amount: Decimal,
    description: str | None,
    user_id: int,
) -> PosExpense:
    """Record a POS expense and post GL entries (Epic 21.4).

    Creates:
    - PosExpense record
    - Cash payout via ``shift_service.add_cash_event`` (updates expected cash)
    - GL entry: Dr Expense account, Cr Cash account

    Does not commit; caller owns the transaction.
    """
    s_res = await db.execute(
        select(PosShift).where(PosShift.id == shift_id, PosShift.status == "open")
    )
    shift = s_res.scalar_one_or_none()
    if not shift:
        raise NotFoundError("Shift not found or not open")

    expense = PosExpense(
        shift_id=shift_id,
        branch_id=shift.branch_id,
        expense_category=expense_category,
        amount=amount,
        description=description,
        created_by_user_id=user_id,
    )
    db.add(expense)
    await db.flush()

    await shift_service.add_cash_event(
        db,
        shift_id=shift_id,
        event_type="payout",
        amount=amount,
        note=description or f"POS {expense_category} expense",
        created_by_user_id=user_id,
    )

    settings_res = await db.execute(select(AccountingSettings).where(AccountingSettings.id == 1))
    settings = settings_res.scalar_one_or_none()
    if not settings:
        raise ValidationError("Accounting is not configured")

    expense_account_id = await _resolve_pos_expense_account_id(db, settings, expense_category)
    gl_ref = f"POS-EXP-{expense.id}"
    await post_expense_voucher(
        db,
        expense_account_id=expense_account_id,
        cash_account_id=None,
        amount=amount,
        entry_date=datetime.now(UTC).date(),
        description=description or f"POS expense: {expense_category}",
        reference=gl_ref,
        branch_id=shift.branch_id,
        memo=f"POS expense {expense.id} by user {user_id}",
        idempotency_key=f"pos-expense:{expense.id}",
        terminal_id=shift.terminal_id,
    )

    await db.refresh(expense)
    return expense


async def _resolve_pos_expense_account_id(
    db: AsyncSession,
    settings: AccountingSettings,
    expense_category: str,
) -> int:
    code = _category_to_account_code(expense_category)
    res = await db.execute(
        select(ChartAccount.id).where(ChartAccount.code == code, ChartAccount.active.is_(True))
    )
    by_code = res.scalar_one_or_none()
    if by_code is not None:
        return int(by_code)
    if settings.default_other_expenses_account_id is not None:
        return int(settings.default_other_expenses_account_id)
    return int(settings.default_cogs_account_id)


def _category_to_account_code(category: str) -> str:
    """Map expense category to default Chart of Accounts code."""
    mapping = {
        "cleaning": "EXP-OPS-CLN",
        "lunch": "EXP-OPS-MEAL",
        "other": "EXP-OPS-MISC",
    }
    return mapping.get(category.lower(), "EXP-OPS-MISC")


async def list_shift_expenses(
    db: AsyncSession,
    *,
    shift_id: int,
) -> list[PosExpense]:
    """List all expenses recorded during a shift."""
    res = await db.execute(
        select(PosExpense)
        .where(PosExpense.shift_id == shift_id)
        .order_by(PosExpense.created_at.desc())
    )
    return list(res.scalars().all())
