"""Financial reporting API (Epic 5.5)."""

import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.accounting import (
    ApOpenItemCreate,
    ArOpenItemCreate,
    BalanceSheetRead,
    BranchFinancialSnapshotRead,
    ChartAccountRead,
    FiscalPeriodRead,
    FiscalPeriodStatusUpdate,
    GeneralLedgerLineRead,
    IncomeStatementRead,
    JournalEntryDetailRead,
    JournalEntryLineRead,
    JournalEntryListItemRead,
    JournalEntryListResponse,
    JournalReversalRequest,
    JournalReversalResponse,
    ManualJournalCreate,
    OpenItemRead,
    PaymentApplicationCreate,
    PaymentApplicationRead,
    TrialBalanceRow,
)
from app.schemas.opening_balance import (
    CapitalInjectionCreate,
    InitialInventoryCreate,
    OpeningBalanceCreate,
    OpeningBalanceLineIn,
    OpeningBalancePostResult,
)
from app.services import audit_service
from app.services.accounting_governance_service import (
    list_periods,
    reverse_journal_entry,
    set_period_status,
)
from app.services.accounting_service import get_journal_by_idempotency, post_journal_entry
from app.services.branch_reporting_service import branch_financial_snapshot
from app.services.financial_reports_service import (
    balance_sheet,
    general_ledger_lines as gl_lines_svc,
    income_statement,
    trial_balance,
)
from app.services.journal_inquiry_service import (
    JournalEntryDetail,
    get_journal_entry_detail,
    list_chart_accounts,
    list_journal_entries,
)
from app.services.opening_balance_service import (
    OpeningBalanceLine,
    post_capital_injection,
    post_initial_inventory,
    post_opening_balance_gl,
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


def _opening_line_to_service(ln: OpeningBalanceLineIn) -> OpeningBalanceLine:
    if ln.debit > 0:
        return OpeningBalanceLine(
            account_id=ln.account_id,
            amount=ln.debit,
            line_type="debit",
            memo=(ln.memo or "").strip(),
            branch_id=ln.branch_id,
        )
    return OpeningBalanceLine(
        account_id=ln.account_id,
        amount=ln.credit,
        line_type="credit",
        memo=(ln.memo or "").strip(),
        branch_id=ln.branch_id,
    )


@router.get("/accounting/trial-balance", response_model=list[TrialBalanceRow])
async def trial_balance_endpoint(
    as_of: date = Query(...),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[TrialBalanceRow]:
    return await trial_balance(db, as_of=as_of, branch_id=branch_id)


@router.get("/accounting/general-ledger", response_model=list[GeneralLedgerLineRead])
async def general_ledger_endpoint(
    account_id: int = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    branch_id: int | None = Query(default=None),
    customer_id: int | None = Query(default=None),
    supplier_id: int | None = Query(default=None),
    employee_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[GeneralLedgerLineRead]:
    rows = await gl_lines_svc(
        db,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
        branch_id=branch_id,
        customer_id=customer_id,
        supplier_id=supplier_id,
        employee_id=employee_id,
    )
    return [GeneralLedgerLineRead.model_validate(r) for r in rows]


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


@router.get(
    "/accounting/reports/branches/{branch_id}/financial-snapshot",
    response_model=BranchFinancialSnapshotRead,
)
async def branch_financial_snapshot_endpoint(
    branch_id: int,
    as_of: date = Query(...),
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> BranchFinancialSnapshotRead:
    if (period_start is None) ^ (period_end is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide both period_start and period_end, or omit both",
        )
    if period_start is not None and period_end is not None and period_end < period_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_end must be on or after period_start",
        )
    data = await branch_financial_snapshot(
        db,
        branch_id=branch_id,
        as_of=as_of,
        period_start=period_start,
        period_end=period_end,
    )
    return BranchFinancialSnapshotRead.model_validate(data)


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
    "/accounting/opening-balance",
    response_model=OpeningBalancePostResult,
    status_code=status.HTTP_201_CREATED,
)
async def post_opening_balance_endpoint(
    body: OpeningBalanceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> OpeningBalancePostResult:
    ikey = (idempotency_key or "").strip() or None
    lines_gl = [_opening_line_to_service(ln) for ln in body.lines]
    result = await post_opening_balance_gl(
        db,
        entry_date=body.entry_date,
        description=body.description,
        lines=lines_gl,
        reference=body.reference,
        default_branch_id=body.branch_id,
        idempotency_key=ikey,
    )
    await audit_service.log(
        session=db,
        action="opening_balance.posted",
        resource_type="journal_entry",
        resource_id=str(result.get("journal_entry_id") or ""),
        new_value=result,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return OpeningBalancePostResult.model_validate(result)


@router.post(
    "/accounting/opening-balance/capital-injection",
    response_model=OpeningBalancePostResult,
    status_code=status.HTTP_201_CREATED,
)
async def post_capital_injection_endpoint(
    body: CapitalInjectionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> OpeningBalancePostResult:
    ikey = (idempotency_key or "").strip() or None
    result = await post_capital_injection(
        db,
        entry_date=body.entry_date,
        cash_amount=body.cash_amount,
        equity_account_id=body.equity_account_id,
        description=body.description,
        reference=body.reference,
        branch_id=body.branch_id,
        cash_account_id=body.cash_account_id,
        idempotency_key=ikey,
    )
    await audit_service.log(
        session=db,
        action="opening_balance.capital_injection",
        resource_type="journal_entry",
        resource_id=str(result.get("journal_entry_id") or ""),
        new_value=result,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return OpeningBalancePostResult.model_validate(result)


@router.post(
    "/accounting/opening-balance/initial-inventory",
    response_model=OpeningBalancePostResult,
    status_code=status.HTTP_201_CREATED,
)
async def post_initial_inventory_endpoint(
    body: InitialInventoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> OpeningBalancePostResult:
    ikey = (idempotency_key or "").strip() or None
    result = await post_initial_inventory(
        db,
        entry_date=body.entry_date,
        inventory_amount=body.inventory_amount,
        source_account_id=body.source_account_id,
        description=body.description,
        reference=body.reference,
        branch_id=body.branch_id,
        inventory_account_id=body.inventory_account_id,
        idempotency_key=ikey,
    )
    await audit_service.log(
        session=db,
        action="opening_balance.initial_inventory",
        resource_type="journal_entry",
        resource_id=str(result.get("journal_entry_id") or ""),
        new_value=result,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return OpeningBalancePostResult.model_validate(result)


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


def _journal_detail_to_read(d: JournalEntryDetail) -> JournalEntryDetailRead:
    return JournalEntryDetailRead(
        id=d.id,
        entry_date=d.entry_date,
        description=d.description,
        source_type=d.source_type,
        source_id=d.source_id,
        reverses_entry_id=d.reverses_entry_id,
        reversed_by_entry_id=d.reversed_by_entry_id,
        lines=[
            JournalEntryLineRead(
                line_no=ln.line_no,
                account_id=ln.account_id,
                code=ln.code,
                name=ln.name,
                account_type=ln.account_type,
                branch_id=ln.branch_id,
                debit=ln.debit,
                credit=ln.credit,
                memo=ln.memo,
                customer_id=ln.customer_id,
                supplier_id=ln.supplier_id,
                employee_id=ln.employee_id,
                subledger_kind=ln.subledger_kind,
            )
            for ln in d.lines
        ],
    )


@router.get("/accounting/journal-entries", response_model=JournalEntryListResponse)
async def list_journal_entries_endpoint(
    date_from: date = Query(...),
    date_to: date = Query(...),
    branch_id: int | None = Query(default=None),
    source_type: str | None = Query(
        default=None, description="Filter: source_type starts with (case-insensitive)"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> JournalEntryListResponse:
    rows, total = await list_journal_entries(
        db,
        date_from=date_from,
        date_to=date_to,
        branch_id=branch_id,
        source_type_prefix=source_type,
        limit=limit,
        offset=offset,
    )
    items = [
        JournalEntryListItemRead(
            id=r.id,
            entry_date=r.entry_date,
            description=r.description,
            source_type=r.source_type,
            source_id=r.source_id,
            total_debit=r.total_debit,
            total_credit=r.total_credit,
            reverses_entry_id=r.reverses_entry_id,
            reversed_by_entry_id=r.reversed_by_entry_id,
        )
        for r in rows
    ]
    return JournalEntryListResponse(items=items, total=total)


@router.get(
    "/accounting/journal-entries/{journal_entry_id}",
    response_model=JournalEntryDetailRead,
)
async def get_journal_entry_endpoint(
    journal_entry_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> JournalEntryDetailRead:
    d = await get_journal_entry_detail(db, journal_entry_id=journal_entry_id)
    return _journal_detail_to_read(d)


@router.get("/accounting/chart-accounts", response_model=list[ChartAccountRead])
async def list_chart_accounts_endpoint(
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[ChartAccountRead]:
    rows = await list_chart_accounts(db, include_inactive=include_inactive)
    return [ChartAccountRead.model_validate(r) for r in rows]


@router.get("/accounting/trial-balance/export")
async def export_trial_balance_csv(
    as_of: date = Query(...),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> StreamingResponse:
    rows = await trial_balance(db, as_of=as_of, branch_id=branch_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "account_id",
            "code",
            "name",
            "account_type",
            "total_debit",
            "total_credit",
            "net",
        ]
    )
    for r in rows:
        w.writerow(
            [
                r["account_id"],
                r["code"],
                r["name"],
                r["account_type"],
                str(r["total_debit"]),
                str(r["total_credit"]),
                str(r["net"]),
            ]
        )
    data = buf.getvalue().encode("utf-8")
    return StreamingResponse(
        iter([data]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="trial_balance.csv"'},
    )


@router.post(
    "/accounting/journal-entries",
    response_model=JournalEntryDetailRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_manual_journal_entry(
    body: ManualJournalCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> JournalEntryDetailRead:
    ikey = idempotency_key or body.idempotency_key
    if not ikey or len(ikey.strip()) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header (or body) required, min 8 characters",
        )
    ikey = ikey.strip()[:256]
    existing = await get_journal_by_idempotency(db, ikey)
    if existing is not None:
        d = await get_journal_entry_detail(db, journal_entry_id=existing.id)
        return _journal_detail_to_read(d)
    line_dicts: list[dict] = []
    for ln in body.lines:
        line_dicts.append(
            {
                "account_id": ln.account_id,
                "branch_id": ln.branch_id,
                "debit": ln.debit,
                "credit": ln.credit,
                "memo": ln.memo,
                "customer_id": ln.customer_id,
                "supplier_id": ln.supplier_id,
                "employee_id": ln.employee_id,
            }
        )
    source_id = str(uuid.uuid4())[:32]
    je = await post_journal_entry(
        db,
        entry_date=body.entry_date,
        description=body.description,
        source_type="manual",
        source_id=source_id,
        idempotency_key=ikey,
        lines=line_dicts,
        strict_subledger=True,
    )
    if je is None:
        ex2 = await get_journal_by_idempotency(db, ikey)
        if ex2 is None:
            raise HTTPException(status_code=500, detail="idempotent post failed")
        d = await get_journal_entry_detail(db, journal_entry_id=ex2.id)
        return _journal_detail_to_read(d)
    await audit_service.log(
        session=db,
        action="journal_entry.manual_posted",
        resource_type="journal_entry",
        resource_id=str(je.id),
        new_value={"id": je.id, "idempotency_key": ikey},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    d = await get_journal_entry_detail(db, journal_entry_id=je.id)
    return _journal_detail_to_read(d)
