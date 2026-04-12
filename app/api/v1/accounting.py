"""Financial reporting API (Epic 5.5)."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.accounting import BalanceSheetRead, IncomeStatementRead
from app.services.financial_reports_service import (
    balance_sheet,
    general_ledger_lines as gl_lines_svc,
    income_statement,
    trial_balance,
)

router = APIRouter()


@router.get("/accounting/trial-balance")
async def trial_balance_endpoint(
    as_of: date = Query(...),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[dict]:
    return await trial_balance(db, as_of=as_of, branch_id=branch_id)


@router.get("/accounting/general-ledger")
async def general_ledger_endpoint(
    account_id: int = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[dict]:
    return await gl_lines_svc(
        db, account_id=account_id, date_from=date_from, date_to=date_to, branch_id=branch_id
    )


@router.get("/accounting/income-statement", response_model=IncomeStatementRead)
async def income_statement_endpoint(
    period_start: date = Query(...),
    period_end: date = Query(...),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> IncomeStatementRead:
    data = await income_statement(
        db, period_start=period_start, period_end=period_end, branch_id=branch_id
    )
    return IncomeStatementRead.model_validate(data)


@router.get("/accounting/balance-sheet", response_model=BalanceSheetRead)
async def balance_sheet_endpoint(
    as_of: date = Query(...),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> BalanceSheetRead:
    data = await balance_sheet(db, as_of=as_of, branch_id=branch_id)
    return BalanceSheetRead.model_validate(data)
