"""Branch-scoped financial reporting helpers (Epic 19.7 foundation).

Delegates to :mod:`financial_reports_service` with ``branch_id`` set so all
statement math stays consistent with global CoA + branch dimension.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.financial_reports_service import balance_sheet, income_statement, trial_balance
from app.utils.money import q2


async def branch_financial_snapshot(
    db: AsyncSession,
    *,
    branch_id: int,
    as_of: date,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict:
    """Roll trial balance for one branch; optionally attach P&L and balance sheet for a window."""
    tb = await trial_balance(db, as_of=as_of, branch_id=branch_id)
    rolled_dr = q2(sum(q2(r["total_debit"]) for r in tb))
    rolled_cr = q2(sum(q2(r["total_credit"]) for r in tb))
    rolled_net = q2(sum(q2(r["net"]) for r in tb))

    out: dict = {
        "branch_id": branch_id,
        "as_of": as_of.isoformat(),
        "trial_balance_accounts": len(tb),
        "rolled_debit": rolled_dr,
        "rolled_credit": rolled_cr,
        "rolled_net": rolled_net,
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
    }

    if period_start is not None and period_end is not None:
        pl = await income_statement(
            db, period_start=period_start, period_end=period_end, branch_id=branch_id
        )
        bs = await balance_sheet(db, as_of=period_end, branch_id=branch_id)
        out["net_income"] = pl["net_income"]
        out["total_revenue"] = pl["total_revenue"]
        out["total_expense"] = pl["total_expense"]
        out["total_assets"] = bs["total_assets"]
        out["total_liabilities"] = bs["total_liabilities"]
        out["total_equity"] = bs["total_equity"]
        out["assets_minus_liabilities_equity"] = bs["assets_minus_liabilities_equity"]
    else:
        out["net_income"] = None
        out["total_assets"] = None

    return out
