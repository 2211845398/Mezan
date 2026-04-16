"""Financial reporting API (Epic 5.5)."""

from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.accounting import (
    ApOpenItemCreate,
    ArOpenItemCreate,
    BalanceSheetRead,
    FiscalPeriodRead,
    FiscalPeriodStatusUpdate,
    IncomeStatementRead,
    JournalReversalRequest,
    JournalReversalResponse,
    OpenItemRead,
    PaymentApplicationCreate,
    PaymentApplicationRead,
)
from app.services import audit_service
from app.services.accounting_governance_service import (
    list_periods,
    reverse_journal_entry,
    set_period_status,
)
from app.services.financial_reports_service import (
    balance_sheet,
    income_statement,
    trial_balance,
)
from app.services.financial_reports_service import (
    general_ledger_lines as gl_lines_svc,
)
from app.services.subledger_service import (
    apply_ap_payment,
    apply_ar_payment,
    create_ap_open_item,
    create_ar_open_item,
    list_ap_open_items,
    list_ar_open_items,
    serialize_ap_item,
    serialize_ar_item,
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


@router.get("/accounting/fiscal-periods", response_model=list[FiscalPeriodRead])
async def list_fiscal_periods_endpoint(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[FiscalPeriodRead]:
    rows = await list_periods(db)
    return [FiscalPeriodRead.model_validate(r) for r in rows]


@router.put("/accounting/fiscal-periods/{period_key}", response_model=FiscalPeriodRead)
async def update_fiscal_period_status_endpoint(
    period_key: str,
    body: FiscalPeriodStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> FiscalPeriodRead:
    row = await set_period_status(
        db,
        period_key=period_key,
        status=body.status,
        actor_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action=f"fiscal_period.{body.status}",
        resource_type="fiscal_period",
        resource_id=row.period_key,
        new_value=FiscalPeriodRead.model_validate(row).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return FiscalPeriodRead.model_validate(row)


@router.post(
    "/accounting/journal-entries/{journal_entry_id}/reverse", response_model=JournalReversalResponse
)
async def reverse_journal_entry_endpoint(
    journal_entry_id: int,
    body: JournalReversalRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
) -> JournalReversalResponse:
    row = await reverse_journal_entry(
        db,
        journal_entry_id=journal_entry_id,
        actor_user_id=current_user.id,
        reason=body.reason,
        reversal_date=body.reversal_date,
    )
    await audit_service.log(
        session=db,
        action="journal_entry.reversed",
        resource_type="journal_entry",
        resource_id=str(row.id),
        new_value=JournalReversalResponse(
            journal_entry_id=row.id,
            reverses_entry_id=row.reverses_entry_id or journal_entry_id,
            idempotency_key=row.idempotency_key,
            entry_date=row.entry_date,
        ).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return JournalReversalResponse(
        journal_entry_id=row.id,
        reverses_entry_id=row.reverses_entry_id or journal_entry_id,
        idempotency_key=row.idempotency_key,
        entry_date=row.entry_date,
    )


@router.post("/accounting/ar/open-items", response_model=OpenItemRead)
async def create_ar_open_item_endpoint(
    body: ArOpenItemCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
) -> OpenItemRead:
    row = await create_ar_open_item(db, data=body.model_dump())
    serialized = serialize_ar_item(row)
    await audit_service.log(
        session=db,
        action="ar_open_item.created",
        resource_type="ar_open_item",
        resource_id=str(row.id),
        new_value=serialized,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return OpenItemRead.model_validate(serialized)


@router.get("/accounting/ar/open-items", response_model=list[OpenItemRead])
async def list_ar_open_items_endpoint(
    branch_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[OpenItemRead]:
    rows = await list_ar_open_items(db, branch_id=branch_id, status=status)
    return [OpenItemRead.model_validate(serialize_ar_item(r)) for r in rows]


@router.post(
    "/accounting/ar/open-items/{open_item_id}/applications",
    response_model=PaymentApplicationRead,
)
async def apply_ar_payment_endpoint(
    open_item_id: int,
    body: PaymentApplicationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> PaymentApplicationRead:
    row = await apply_ar_payment(
        db,
        ar_open_item_id=open_item_id,
        amount=body.amount,
        reference=body.reference,
        note=body.note,
        created_by_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="ar_open_item.payment_applied",
        resource_type="ar_payment_application",
        resource_id=str(row.id),
        new_value=PaymentApplicationRead.model_validate(row).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PaymentApplicationRead.model_validate(row)


@router.post("/accounting/ap/open-items", response_model=OpenItemRead)
async def create_ap_open_item_endpoint(
    body: ApOpenItemCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
) -> OpenItemRead:
    row = await create_ap_open_item(db, data=body.model_dump())
    serialized = serialize_ap_item(row)
    await audit_service.log(
        session=db,
        action="ap_open_item.created",
        resource_type="ap_open_item",
        resource_id=str(row.id),
        new_value=serialized,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return OpenItemRead.model_validate(serialized)


@router.get("/accounting/ap/open-items", response_model=list[OpenItemRead])
async def list_ap_open_items_endpoint(
    branch_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[OpenItemRead]:
    rows = await list_ap_open_items(db, branch_id=branch_id, status=status)
    return [OpenItemRead.model_validate(serialize_ap_item(r)) for r in rows]


@router.post(
    "/accounting/ap/open-items/{open_item_id}/applications",
    response_model=PaymentApplicationRead,
)
async def apply_ap_payment_endpoint(
    open_item_id: int,
    body: PaymentApplicationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> PaymentApplicationRead:
    row = await apply_ap_payment(
        db,
        ap_open_item_id=open_item_id,
        amount=body.amount,
        reference=body.reference,
        note=body.note,
        created_by_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="ap_open_item.payment_applied",
        resource_type="ap_payment_application",
        resource_id=str(row.id),
        new_value=PaymentApplicationRead.model_validate(row).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PaymentApplicationRead.model_validate(row)
