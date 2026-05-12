"""FX revaluation service for multi-currency accounting (Epic 20.2).

Revalues open AR, AP, and bank balances at period close;
posts Dr/Cr FX Gain/Loss to adjust to current exchange rates.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.ar_open_item import ArOpenItem
from app.models.chart_account import ChartAccount
from app.models.currency import Currency
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.payables_open_item import PayablesOpenItem
from app.services.accounting_governance_service import ensure_period_not_hard_closed
from app.services.accounting_service import get_accounting_settings
from app.utils.money import q2

_FX_QUANT = Decimal("0.00000001")


async def run_fx_revaluation(
    db: AsyncSession,
    *,
    revaluation_date: date,
    branch_id: int | None = None,
    created_by_user_id: int | None = None,
) -> list[JournalEntry]:
    """Run FX revaluation for open AR/AP items and bank accounts.

    For each foreign-currency denominated open item:
    - Calculate difference between booked value and current value at today's rate
    - Post FX gain/loss entry to adjust to current rate

    Returns list of created journal entries.
    """
    await ensure_period_not_hard_closed(db, revaluation_date)

    settings = await get_accounting_settings(db)
    base_currency = "USD"  # Default base; could read from settings

    entries: list[JournalEntry] = []

    # Get all active foreign currencies
    curr_res = await db.execute(
        select(Currency).where(Currency.code != base_currency, Currency.is_active == True)
    )
    currencies = {c.code: c for c in curr_res.scalars().all()}

    for curr_code, currency in currencies.items():
        if currency.exchange_rate_to_base is None or currency.exchange_rate_to_base <= 0:
            continue  # Skip if no valid rate

        current_rate = currency.exchange_rate_to_base.quantize(_FX_QUANT, rounding=ROUND_HALF_UP)

        # Revalue AR open items in this currency
        ar_entries = await _revalue_ar_items(
            db,
            currency_code=curr_code,
            current_rate=current_rate,
            revaluation_date=revaluation_date,
            base_currency=base_currency,
            settings=settings,
            branch_id=branch_id,
            created_by_user_id=created_by_user_id,
        )
        entries.extend(ar_entries)

        # Revalue AP open items in this currency
        ap_entries = await _revalue_ap_items(
            db,
            currency_code=curr_code,
            current_rate=current_rate,
            revaluation_date=revaluation_date,
            base_currency=base_currency,
            settings=settings,
            branch_id=branch_id,
            created_by_user_id=created_by_user_id,
        )
        entries.extend(ap_entries)

    if entries:
        await db.commit()
    return entries


async def _revalue_ar_items(
    db: AsyncSession,
    *,
    currency_code: str,
    current_rate: Decimal,
    revaluation_date: date,
    base_currency: str,
    settings,
    branch_id: int | None,
    created_by_user_id: int | None,
) -> list[JournalEntry]:
    """Revalue AR open items and return any created journal entries."""
    from decimal import Decimal

    entries: list[JournalEntry] = []

    # Find open AR items with foreign currency
    ar_res = await db.execute(
        select(ArOpenItem).where(
            ArOpenItem.amount_open > 0,
            ArOpenItem.currency_code == currency_code,
        )
    )
    ar_items = ar_res.scalars().all()

    for item in ar_items:
        if branch_id and item.branch_id != branch_id:
            continue

        # Calculate revaluation difference
        # Original booked amount in base currency = amount_open * original_rate
        # Current value = amount_open * current_rate
        # Difference = current_value - booked_value
        original_rate = item.fx_rate or current_rate
        open_amt = Decimal(str(item.amount_open))

        booked_base = q2(open_amt * original_rate)
        current_base = q2(open_amt * current_rate)
        diff = q2(current_base - booked_base)

        if diff == 0:
            continue

        # Determine FX gain/loss accounts
        if diff > 0:
            # AR increased = FX loss (debit) for us
            fx_loss_account = getattr(
                settings, "default_fx_loss_account_id", settings.default_other_expenses_account_id
            )
            fx_gain_account = None
        else:
            # AR decreased = FX gain (credit)
            fx_gain_account = getattr(
                settings, "default_fx_gain_account_id", settings.default_other_income_account_id
            )
            fx_loss_account = None

        ar_account = settings.default_ar_account_id

        # Create revaluation entry
        lines: list[dict] = []
        if diff > 0:
            # Loss: Dr FX Loss, Cr AR
            lines = [
                {
                    "account_id": fx_loss_account,
                    "branch_id": item.branch_id,
                    "debit": diff,
                    "credit": Decimal("0"),
                    "currency_code": base_currency,
                    "memo": f"FX revaluation loss on AR {item.source_type} {item.source_id}",
                },
                {
                    "account_id": ar_account,
                    "branch_id": item.branch_id,
                    "debit": Decimal("0"),
                    "credit": diff,
                    "currency_code": base_currency,
                    "memo": f"FX revaluation AR adjustment",
                },
            ]
        else:
            # Gain: Dr AR, Cr FX Gain (diff is negative, so flip signs)
            gain_amt = abs(diff)
            lines = [
                {
                    "account_id": ar_account,
                    "branch_id": item.branch_id,
                    "debit": gain_amt,
                    "credit": Decimal("0"),
                    "currency_code": base_currency,
                    "memo": f"FX revaluation AR adjustment",
                },
                {
                    "account_id": fx_gain_account,
                    "branch_id": item.branch_id,
                    "debit": Decimal("0"),
                    "credit": gain_amt,
                    "currency_code": base_currency,
                    "memo": f"FX revaluation gain on AR {item.source_type} {item.source_id}",
                },
            ]

        entry = JournalEntry(
            entry_date=revaluation_date,
            description=f"FX Revaluation {currency_code} AR - {item.source_type} {item.source_id}",
            source_type="fx_revaluation",
            source_id=f"{item.id}",
            idempotency_key=f"fx_reval:ar:{item.id}:{revaluation_date.isoformat()}",
            lines=[JournalEntryLine(**ln, line_no=i + 1) for i, ln in enumerate(lines)],
        )
        db.add(entry)
        entries.append(entry)

    return entries


async def _revalue_ap_items(
    db: AsyncSession,
    *,
    currency_code: str,
    current_rate: Decimal,
    revaluation_date: date,
    base_currency: str,
    settings,
    branch_id: int | None,
    created_by_user_id: int | None,
) -> list[JournalEntry]:
    """Revalue AP open items and return any created journal entries."""
    from decimal import Decimal

    entries: list[JournalEntry] = []

    # Find open AP items with foreign currency
    ap_res = await db.execute(
        select(PayablesOpenItem).where(
            PayablesOpenItem.amount_open > 0,
            PayablesOpenItem.currency_code == currency_code,
        )
    )
    ap_items = ap_res.scalars().all()

    for item in ap_items:
        if branch_id and item.branch_id != branch_id:
            continue

        original_rate = item.fx_rate or current_rate
        open_amt = Decimal(str(item.amount_open))

        booked_base = q2(open_amt * original_rate)
        current_base = q2(open_amt * current_rate)
        diff = q2(current_base - booked_base)

        if diff == 0:
            continue

        # For AP (liability):
        # If rate increases (we owe more in base currency) = FX loss
        # If rate decreases (we owe less) = FX gain
        if diff > 0:
            fx_loss_account = getattr(
                settings, "default_fx_loss_account_id", settings.default_other_expenses_account_id
            )
        else:
            fx_gain_account = getattr(
                settings, "default_fx_gain_account_id", settings.default_other_income_account_id
            )

        ap_account = settings.default_ap_account_id

        lines: list[dict] = []
        if diff > 0:
            # Loss: Dr FX Loss, Cr AP (increase liability)
            lines = [
                {
                    "account_id": fx_loss_account,
                    "branch_id": item.branch_id,
                    "debit": diff,
                    "credit": Decimal("0"),
                    "currency_code": base_currency,
                    "memo": f"FX revaluation loss on AP {item.source_type} {item.source_id}",
                },
                {
                    "account_id": ap_account,
                    "branch_id": item.branch_id,
                    "debit": Decimal("0"),
                    "credit": diff,
                    "currency_code": base_currency,
                    "memo": f"FX revaluation AP adjustment",
                },
            ]
        else:
            # Gain: Dr AP, Cr FX Gain (decrease liability)
            gain_amt = abs(diff)
            lines = [
                {
                    "account_id": ap_account,
                    "branch_id": item.branch_id,
                    "debit": gain_amt,
                    "credit": Decimal("0"),
                    "currency_code": base_currency,
                    "memo": f"FX revaluation AP adjustment",
                },
                {
                    "account_id": getattr(
                        settings, "default_fx_gain_account_id", settings.default_other_income_account_id
                    ),
                    "branch_id": item.branch_id,
                    "debit": Decimal("0"),
                    "credit": gain_amt,
                    "currency_code": base_currency,
                    "memo": f"FX revaluation gain on AP {item.source_type} {item.source_id}",
                },
            ]

        entry = JournalEntry(
            entry_date=revaluation_date,
            description=f"FX Revaluation {currency_code} AP - {item.source_type} {item.source_id}",
            source_type="fx_revaluation",
            source_id=f"{item.id}",
            idempotency_key=f"fx_reval:ap:{item.id}:{revaluation_date.isoformat()}",
            lines=[JournalEntryLine(**ln, line_no=i + 1) for i, ln in enumerate(lines)],
        )
        db.add(entry)
        entries.append(entry)

    return entries
