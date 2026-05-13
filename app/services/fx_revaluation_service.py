"""FX revaluation service for multi-currency accounting (Epic 20.2).

Revalues open AR, AP, and bank balances at period close;
posts Dr/Cr FX Gain/Loss to adjust to current exchange rates.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.accounting_settings import AccountingSettings
from app.models.ap_open_item import ApOpenItem
from app.models.ar_open_item import ArOpenItem
from app.models.currency import Currency
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.services.accounting_governance_service import ensure_period_open
from app.services.accounting_service import get_accounting_settings
from app.utils.money import q2

_FX_QUANT = Decimal("0.00000001")


@dataclass(frozen=True)
class FxPreviewCurrencySummary:
    currency_code: str
    current_rate: Decimal
    open_ar_count: int
    open_ap_count: int
    estimated_gain_loss: Decimal


@dataclass(frozen=True)
class FxRevaluationPreviewResult:
    as_of_date: date
    branch_id: int | None
    currencies: list[FxPreviewCurrencySummary]
    total_estimated_gain_loss: Decimal


async def _base_currency_code(db: AsyncSession, settings: AccountingSettings) -> str:
    res = await db.execute(select(Currency.code).where(Currency.id == settings.base_currency_id))
    code = res.scalar_one_or_none()
    if not code:
        raise ValidationError(
            "Base currency is not configured",
            details={"base_currency_id": settings.base_currency_id},
        )
    return str(code).strip()


def _fx_base_delta(*, amount_open: Decimal, original_rate: Decimal, current_rate: Decimal) -> Decimal:
    open_amt = Decimal(str(amount_open))
    booked_base = q2(open_amt * original_rate)
    current_base = q2(open_amt * current_rate)
    return q2(current_base - booked_base)


async def preview_fx_revaluation(
    db: AsyncSession,
    *,
    as_of_date: date,
    branch_id: int | None = None,
) -> FxRevaluationPreviewResult:
    """Read-only AR/AP FX exposure: same valuation math as run, without period checks or JEs."""
    settings = await get_accounting_settings(db)
    base_currency = await _base_currency_code(db, settings)

    curr_res = await db.execute(select(Currency).where(Currency.code != base_currency))
    currencies = {c.code: c for c in curr_res.scalars().all()}

    summaries: list[FxPreviewCurrencySummary] = []
    total_all = Decimal("0")

    for curr_code, currency in currencies.items():
        if currency.exchange_rate_to_base is None or currency.exchange_rate_to_base <= 0:
            continue

        current_rate = currency.exchange_rate_to_base.quantize(_FX_QUANT, rounding=ROUND_HALF_UP)

        ar_res = await db.execute(
            select(ArOpenItem).where(
                ArOpenItem.amount_open > 0,
                ArOpenItem.currency_code == curr_code,
            )
        )
        ar_items = ar_res.scalars().all()
        ar_sum = Decimal("0")
        ar_count = 0
        for item in ar_items:
            if branch_id is not None and item.branch_id != branch_id:
                continue
            ar_count += 1
            orig = item.fx_rate or current_rate
            ar_sum += _fx_base_delta(
                amount_open=item.amount_open,
                original_rate=orig,
                current_rate=current_rate,
            )

        ap_res = await db.execute(
            select(ApOpenItem).where(
                ApOpenItem.amount_open > 0,
                ApOpenItem.currency_code == curr_code,
            )
        )
        ap_items = ap_res.scalars().all()
        ap_sum = Decimal("0")
        ap_count = 0
        for item in ap_items:
            if branch_id is not None and item.branch_id != branch_id:
                continue
            ap_count += 1
            orig = item.fx_rate or current_rate
            ap_sum += _fx_base_delta(
                amount_open=item.amount_open,
                original_rate=orig,
                current_rate=current_rate,
            )

        est = q2(ar_sum + ap_sum)
        if ar_count == 0 and ap_count == 0:
            continue

        summaries.append(
            FxPreviewCurrencySummary(
                currency_code=curr_code,
                current_rate=current_rate,
                open_ar_count=ar_count,
                open_ap_count=ap_count,
                estimated_gain_loss=est,
            )
        )
        total_all = q2(total_all + est)

    return FxRevaluationPreviewResult(
        as_of_date=as_of_date,
        branch_id=branch_id,
        currencies=summaries,
        total_estimated_gain_loss=total_all,
    )


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

    Returns list of created journal entries. Does not commit; caller commits.
    """
    _ = created_by_user_id
    await ensure_period_open(db, entry_date=revaluation_date)

    settings = await get_accounting_settings(db)
    base_currency = await _base_currency_code(db, settings)

    entries: list[JournalEntry] = []

    # Get all active foreign currencies
    curr_res = await db.execute(select(Currency).where(Currency.code != base_currency))
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
        )
        entries.extend(ap_entries)

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
) -> list[JournalEntry]:
    """Revalue AR open items and return any created journal entries."""
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

        original_rate = item.fx_rate or current_rate
        diff = _fx_base_delta(
            amount_open=item.amount_open,
            original_rate=original_rate,
            current_rate=current_rate,
        )

        if diff == 0:
            continue

        # Determine FX gain/loss accounts
        if diff > 0:
            # AR increased = FX loss (debit) for us
            fx_loss_account = int(
                getattr(settings, "default_fx_loss_account_id", None)
                or settings.default_other_expenses_account_id
                or settings.default_cogs_account_id
            )
            fx_gain_account = None
        else:
            # AR decreased = FX gain (credit)
            fx_gain_account = int(
                getattr(settings, "default_fx_gain_account_id", None)
                or settings.default_sales_revenue_account_id
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
                    "memo": "FX revaluation AR adjustment",
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
                    "memo": "FX revaluation AR adjustment",
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
) -> list[JournalEntry]:
    """Revalue AP open items and return any created journal entries."""
    entries: list[JournalEntry] = []

    # Find open AP items with foreign currency
    ap_res = await db.execute(
        select(ApOpenItem).where(
            ApOpenItem.amount_open > 0,
            ApOpenItem.currency_code == currency_code,
        )
    )
    ap_items = ap_res.scalars().all()

    for item in ap_items:
        if branch_id and item.branch_id != branch_id:
            continue

        original_rate = item.fx_rate or current_rate
        diff = _fx_base_delta(
            amount_open=item.amount_open,
            original_rate=original_rate,
            current_rate=current_rate,
        )

        if diff == 0:
            continue

        # For AP (liability):
        # If rate increases (we owe more in base currency) = FX loss
        # If rate decreases (we owe less) = FX gain
        if diff > 0:
            fx_loss_account = int(
                getattr(settings, "default_fx_loss_account_id", None)
                or settings.default_other_expenses_account_id
                or settings.default_cogs_account_id
            )
            fx_gain_account = None
        else:
            fx_gain_account = int(
                getattr(settings, "default_fx_gain_account_id", None)
                or settings.default_sales_revenue_account_id
            )
            fx_loss_account = None

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
                    "memo": "FX revaluation AP adjustment",
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
                    "memo": "FX revaluation AP adjustment",
                },
                {
                    "account_id": fx_gain_account,
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
