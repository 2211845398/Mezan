"""Opening balance posting service (Epic 19.3).

Handles capital injection and initial asset/inventory acquisition for new businesses
or fiscal period openings. Posts to GL with idempotency and period controls.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.services.accounting_service import get_accounting_settings, post_journal_entry
from app.utils.money import q2


@dataclass
class OpeningBalanceLine:
    """Single line in opening balance entry."""

    account_id: int
    amount: Decimal
    line_type: Literal["debit", "credit"]
    memo: str = ""
    branch_id: int | None = None


async def post_opening_balance_gl(
    db: AsyncSession,
    *,
    entry_date: date,
    description: str,
    lines: list[OpeningBalanceLine],
    reference: str | None = None,
    default_branch_id: int,
    idempotency_key: str | None = None,
) -> dict:
    """Post opening balance journal entry.

    For a new business, typical entries:
    - Dr Cash (capital injection)
    - Cr Owner's Equity (capital)

    Or for inventory opening:
    - Dr Inventory
    - Cr Cash / Cr AP

    Args:
        entry_date: Entry date (must be in an open period)
        description: Entry description
        lines: List of OpeningBalanceLine (must balance)
        reference: Optional reference number
        default_branch_id: Branch used when a line omits ``branch_id``
        idempotency_key: Optional idempotency key

    Returns:
        Dict with journal_entry_id, status, message

    Raises:
        ValidationError: If entry doesn't balance, period closed, or accounts invalid
    """
    if not lines:
        raise ValidationError("Opening balance must have at least one line")

    # Validate amounts balance
    total_dr = Decimal("0")
    total_cr = Decimal("0")
    journal_lines = []

    for i, line in enumerate(lines):
        amt = q2(line.amount)
        if amt <= 0:
            raise ValidationError(f"Line {i} amount must be positive", details={"amount": str(amt)})

        line_branch = line.branch_id if line.branch_id is not None else default_branch_id

        if line.line_type == "debit":
            total_dr += amt
            journal_lines.append(
                {
                    "account_id": line.account_id,
                    "branch_id": line_branch,
                    "debit": amt,
                    "credit": Decimal("0"),
                    "memo": line.memo or "Opening balance - debit",
                }
            )
        else:
            total_cr += amt
            journal_lines.append(
                {
                    "account_id": line.account_id,
                    "branch_id": line_branch,
                    "debit": Decimal("0"),
                    "credit": amt,
                    "memo": line.memo or "Opening balance - credit",
                }
            )

    if q2(total_dr) != q2(total_cr):
        raise ValidationError(
            "Opening balance must balance (total debits = total credits)",
            details={"total_debit": str(total_dr), "total_credit": str(total_cr)},
        )

    # Build idempotency key
    if not idempotency_key:
        idempotency_key = f"opening_balance:{default_branch_id}:{entry_date.isoformat()}:{total_dr}"
        if reference:
            idempotency_key += f":{reference}"

    je = await post_journal_entry(
        db,
        entry_date=entry_date,
        description=description[:512],
        source_type="opening_balance",
        source_id=reference or str(idempotency_key),
        idempotency_key=idempotency_key,
        lines=journal_lines,
    )

    if je is None:
        return {
            "status": "duplicate",
            "message": "Opening balance already posted (idempotency key matched)",
            "idempotency_key": idempotency_key,
        }

    return {
        "status": "posted",
        "journal_entry_id": je.id,
        "idempotency_key": idempotency_key,
        "message": "Opening balance posted successfully",
        "total_amount": str(total_dr),
    }


async def post_capital_injection(
    db: AsyncSession,
    *,
    entry_date: date,
    cash_amount: Decimal,
    equity_account_id: int,
    description: str | None = None,
    reference: str | None = None,
    branch_id: int,
    cash_account_id: int | None = None,
    idempotency_key: str | None = None,
) -> dict:
    """Simplified capital injection: Dr Cash, Cr Equity.

    Args:
        entry_date: Entry date
        cash_amount: Capital amount
        equity_account_id: Owner's equity account to credit
        description: Optional description (defaults to "Capital injection")
        reference: Optional reference
        branch_id: Branch
        cash_account_id: Optional specific cash account (or default from settings)
    """
    settings = await get_accounting_settings(db)

    lines = [
        OpeningBalanceLine(
            account_id=cash_account_id or settings.default_cash_account_id,
            amount=cash_amount,
            line_type="debit",
            memo="Capital injection - cash",
            branch_id=branch_id,
        ),
        OpeningBalanceLine(
            account_id=equity_account_id,
            amount=cash_amount,
            line_type="credit",
            memo="Capital injection - equity",
            branch_id=branch_id,
        ),
    ]

    return await post_opening_balance_gl(
        db,
        entry_date=entry_date,
        description=description or "Capital injection",
        lines=lines,
        reference=reference,
        default_branch_id=branch_id,
        idempotency_key=idempotency_key,
    )


async def post_initial_inventory(
    db: AsyncSession,
    *,
    entry_date: date,
    inventory_amount: Decimal,
    source_account_id: int,
    description: str | None = None,
    reference: str | None = None,
    branch_id: int,
    inventory_account_id: int | None = None,
    idempotency_key: str | None = None,
) -> dict:
    """Simplified initial inventory: Dr Inventory, Cr Cash/AP.

    Args:
        entry_date: Entry date
        inventory_amount: Inventory value
        source_account_id: Cash or AP account to credit
        description: Optional description
        reference: Optional reference
        branch_id: Branch
        inventory_account_id: Optional specific inventory account (or default)
    """
    settings = await get_accounting_settings(db)

    lines = [
        OpeningBalanceLine(
            account_id=inventory_account_id or settings.default_inventory_account_id,
            amount=inventory_amount,
            line_type="debit",
            memo="Initial inventory",
            branch_id=branch_id,
        ),
        OpeningBalanceLine(
            account_id=source_account_id,
            amount=inventory_amount,
            line_type="credit",
            memo="Inventory funding",
            branch_id=branch_id,
        ),
    ]

    return await post_opening_balance_gl(
        db,
        entry_date=entry_date,
        description=description or "Initial inventory acquisition",
        lines=lines,
        reference=reference,
        default_branch_id=branch_id,
        idempotency_key=idempotency_key,
    )
