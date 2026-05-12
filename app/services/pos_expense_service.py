"""POS expense recording with GL posting (Epic 21.4)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.pos_expense import PosExpense
from app.models.pos_shift import PosCashEvent, PosShift
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
    - PosCashEvent of type 'payout' for cash tracking
    - GL entry: Dr Expense account, Cr Cash account
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

    # Record as cash payout from the shift
    db.add(
        PosCashEvent(
            shift_id=shift_id,
            event_type="payout",
            amount=amount,
            note=description or f"POS {expense_category} expense",
            created_by_user_id=user_id,
        )
    )

    await db.flush()

    # Post GL: Dr Expense, Cr Cash (Epic 21.4)
    # Use default expense account code based on category
    expense_account_code = _category_to_account_code(expense_category)
    gl_ref = f"POS-EXP-{expense.id}"
    await post_expense_voucher(
        db,
        expense_account_code=expense_account_code,
        cash_account_id=None,  # Use default cash from settings
        amount=amount,
        currency="USD",  # Default, can be parameterized
        entry_date=datetime.now(UTC).date(),
        description=description or f"POS expense: {expense_category}",
        reference=gl_ref,
        branch_id=shift.branch_id,
        memo=f"POS expense {expense.id} by user {user_id}",
    )

    await db.commit()
    await db.refresh(expense)
    return expense


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
