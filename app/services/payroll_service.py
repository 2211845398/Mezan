"""Payroll calculation and export services (Epic 4.3/4.4)."""

from __future__ import annotations

import calendar
import csv
import hashlib
import io
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, StateTransitionError, ValidationError
from app.models.attendance_log import AttendanceLog
from app.models.employee_profile import EmployeeProfile
from app.models.payslip import Payslip, PayslipStatus
from app.models.users import User
from app.schemas.payroll import PayslipRead
from app.utils.person_name import person_name_sql_expr
from app.services import employee_service as employee_service_module
from app.services.attendance_payroll_engine import compute_period_payroll_components
from app.services.document_posting_service import post_payslip_approved_gl

MONEY_Q = Decimal("0.01")


def _utc_today() -> date:
    """Today in UTC (used for monthly approval gate); patch in tests."""
    return datetime.now(UTC).date()


def _q(value: Decimal) -> Decimal:
    return value.quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def calendar_month_period_bounds(year: int, month: int) -> tuple[date, date]:
    """First and last calendar day for ``year``/``month``."""
    if month < 1 or month > 12:
        raise ValidationError("month must be between 1 and 12", details={"month": month})
    _, last = calendar.monthrange(year, month)
    return date(year, month, 1), date(year, month, last)


def approval_opens_on_for_month(year: int, month: int) -> date:
    """First date in the payroll month when approve/pay is allowed (clamped to month end)."""
    _, last = calendar.monthrange(year, month)
    day = min(settings.PAYROLL_APPROVAL_OPEN_DAY_OF_MONTH, last)
    return date(year, month, day)


def is_full_calendar_month_period(period_start: date, period_end: date) -> bool:
    """True if the range is exactly one calendar month (1st through last day)."""
    if period_start.day != 1:
        return False
    _, last = calendar.monthrange(period_start.year, period_start.month)
    expected_end = date(period_start.year, period_start.month, last)
    return (
        period_end == expected_end
        and period_start.year == period_end.year
        and period_start.month == period_end.month
    )


def assert_calendar_month_payroll_actions_allowed(
    period_start: date,
    period_end: date,
    *,
    today: date | None = None,
) -> None:
    """Block approve/pay for full calendar-month periods until the configured open day."""
    if not is_full_calendar_month_period(period_start, period_end):
        return
    ref = today if today is not None else _utc_today()
    opens = approval_opens_on_for_month(period_start.year, period_start.month)
    if ref < opens:
        label = period_start.strftime("%B %Y")
        raise ConflictError(
            f"Payroll approval for {label} opens on {opens.isoformat()}.",
            details={
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "approval_opens_on": opens.isoformat(),
                "today": ref.isoformat(),
            },
        )


def is_approval_open_for_calendar_month(year: int, month: int, *, today: date | None = None) -> bool:
    ref = today if today is not None else _utc_today()
    opens = approval_opens_on_for_month(year, month)
    return ref >= opens


def _period_window(period_start: date, period_end: date) -> tuple[datetime, datetime]:
    start_dt = datetime.combine(period_start, time.min).replace(tzinfo=UTC)
    end_dt = datetime.combine(period_end + timedelta(days=1), time.min).replace(tzinfo=UTC)
    return start_dt, end_dt


async def _get_employee_profile(db: AsyncSession, employee_profile_id: int) -> EmployeeProfile:
    res = await db.execute(select(EmployeeProfile).where(EmployeeProfile.id == employee_profile_id))
    employee = res.scalar_one_or_none()
    if not employee:
        raise NotFoundError(
            "Employee profile not found", details={"employee_profile_id": employee_profile_id}
        )
    return employee


async def _compute_hours_worked(
    db: AsyncSession,
    *,
    employee_profile_id: int,
    period_start: date,
    period_end: date,
) -> Decimal:
    window_start, window_end = _period_window(period_start, period_end)
    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.employee_profile_id == employee_profile_id,
                AttendanceLog.clock_out_at.is_not(None),
                AttendanceLog.clock_in_at < window_end,
                AttendanceLog.clock_out_at > window_start,
            )
        )
    )
    logs = list(result.scalars().all())
    total_seconds = Decimal("0")
    for log in logs:
        in_at = log.clock_in_at.astimezone(UTC)
        out_at = log.clock_out_at.astimezone(UTC)  # guarded by query
        if out_at <= in_at:
            continue
        overlap_start = max(in_at, window_start)
        overlap_end = min(out_at, window_end)
        if overlap_end <= overlap_start:
            continue
        total_seconds += Decimal(str((overlap_end - overlap_start).total_seconds()))
    return _q(total_seconds / Decimal("3600"))


def _make_immutable_hash(
    *,
    employee_profile_id: int,
    period_start: date,
    period_end: date,
    hours_worked: Decimal,
    hourly_rate: Decimal,
    gross_amount: Decimal,
    deductions: Decimal,
    net_amount: Decimal,
    bonus_amount: Decimal,
    automatic_deductions_amount: Decimal,
) -> str:
    raw = (
        f"{employee_profile_id}|{period_start.isoformat()}|{period_end.isoformat()}|"
        f"{hours_worked}|{hourly_rate}|{gross_amount}|{deductions}|{net_amount}|"
        f"{bonus_amount}|{automatic_deductions_amount}"
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def generate_payslip(
    db: AsyncSession,
    *,
    employee_profile_id: int,
    period_start: date,
    period_end: date,
    deductions: Decimal,
    hourly_rate_override: Decimal | None = None,
    bonus_amount: Decimal | None = None,
    idempotency_key: str | None = None,
) -> tuple[Payslip, bool]:
    """Returns (payslip, created). When idempotency_key replays, created is False.

    ``deductions`` is **manual** deductions only; automatic attendance deductions are computed.
    """
    if period_end < period_start:
        raise ValidationError("period_end must be on or after period_start")
    if idempotency_key is not None and len(idempotency_key) < 8:
        raise ValidationError(
            "idempotency_key must be at least 8 characters",
            details={"field": "idempotency_key"},
        )
    if idempotency_key is not None:
        prior = await db.execute(
            select(Payslip).where(Payslip.generate_idempotency_key == idempotency_key)
        )
        found = prior.scalar_one_or_none()
        if found:
            return found, False

    employee = await _get_employee_profile(db, employee_profile_id)

    existing = await db.execute(
        select(Payslip).where(
            Payslip.employee_profile_id == employee_profile_id,
            Payslip.period_start == period_start,
            Payslip.period_end == period_end,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Payslip already exists for this period")

    if deductions < Decimal("0"):
        raise ValidationError("deductions must be >= 0")

    bonus = bonus_amount if bonus_amount is not None else Decimal("0")
    if bonus < Decimal("0"):
        raise ValidationError("bonus_amount must be >= 0")

    rate = hourly_rate_override if hourly_rate_override is not None else employee.hourly_rate
    if rate is None:
        rate = Decimal("0")
    if rate <= Decimal("0") and (
        employee.base_salary is None or employee.base_salary <= Decimal("0")
    ):
        raise ValidationError(
            "Either base_salary or hourly_rate (or hourly_rate_override) must be set to compute payroll"
        )

    comp = await compute_period_payroll_components(
        db,
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
        bonus=bonus,
        manual_deductions=deductions,
        hourly_rate_override=hourly_rate_override,
    )
    gross = comp["gross_amount"]
    net = comp["net_amount"]
    total_deductions = comp["total_deductions"]
    if net < Decimal("0"):
        raise ValidationError("Net amount cannot be negative")

    h = _make_immutable_hash(
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
        hours_worked=comp["hours_worked"],
        hourly_rate=comp["hourly_rate"],
        gross_amount=gross,
        deductions=total_deductions,
        net_amount=net,
        bonus_amount=comp["bonus_amount"],
        automatic_deductions_amount=comp["automatic_deductions_amount"],
    )
    payslip = Payslip(
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
        hours_worked=comp["hours_worked"],
        hourly_rate=comp["hourly_rate"],
        deductions=_q(total_deductions),
        gross_amount=gross,
        net_amount=net,
        status=PayslipStatus.DRAFT,
        immutable_hash=h,
        generate_idempotency_key=idempotency_key,
        base_salary_amount=comp["base_salary_amount"],
        bonus_amount=comp["bonus_amount"],
        overtime_amount=comp["overtime_amount"],
        automatic_deductions_amount=comp["automatic_deductions_amount"],
        manual_deductions_amount=comp["manual_deductions_amount"],
        calculation_details=comp["calculation_details"],
    )
    db.add(payslip)
    await db.flush()
    await db.refresh(payslip)
    return payslip, True


async def get_payslip(db: AsyncSession, payslip_id: int) -> Payslip:
    res = await db.execute(select(Payslip).where(Payslip.id == payslip_id))
    payslip = res.scalar_one_or_none()
    if not payslip:
        raise NotFoundError("Payslip not found", details={"payslip_id": payslip_id})
    return payslip


async def list_payslips(db: AsyncSession, *, status: str | None = None) -> list[Payslip]:
    q = select(Payslip).order_by(Payslip.created_at.desc())
    if status is not None:
        q = q.where(Payslip.status == status)
    res = await db.execute(q)
    return list(res.scalars().all())


async def list_payslips_read(
    db: AsyncSession,
    *,
    status: str | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PayslipRead], int]:
    """Paginated payslips with linked user display fields (for API responses)."""
    from sqlalchemy import func

    from app.schemas.pagination import clamp_pagination

    limit, offset = clamp_pagination(limit, offset)
    count_stmt = select(func.count()).select_from(Payslip)
    if status is not None:
        count_stmt = count_stmt.where(Payslip.status == status)
    if period_start is not None and period_end is not None:
        count_stmt = count_stmt.where(
            Payslip.period_start == period_start,
            Payslip.period_end == period_end,
        )
    total = int(await db.scalar(count_stmt) or 0)

    stmt = (
        select(
            Payslip,
            person_name_sql_expr(User.first_name, User.father_name, User.family_name),
            User.email,
        )
        .join(EmployeeProfile, EmployeeProfile.id == Payslip.employee_profile_id)
        .join(User, User.id == EmployeeProfile.user_id)
        .order_by(Payslip.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status is not None:
        stmt = stmt.where(Payslip.status == status)
    if period_start is not None and period_end is not None:
        stmt = stmt.where(
            Payslip.period_start == period_start,
            Payslip.period_end == period_end,
        )
    res = await db.execute(stmt)
    out: list[PayslipRead] = []
    for payslip, full_name, email in res.all():
        base = PayslipRead.model_validate(payslip)
        out.append(
            base.model_copy(update={"user_full_name": full_name, "user_email": email}),
        )
    return out, total


async def approve_payslip(
    db: AsyncSession,
    *,
    payslip_id: int,
    approver_user_id: int,
    idempotency_key: str | None = None,
) -> tuple[Payslip, bool]:
    """Returns (payslip, applied). applied is False on idempotent replay."""
    if idempotency_key is not None and len(idempotency_key) < 8:
        raise ValidationError(
            "idempotency_key must be at least 8 characters",
            details={"field": "idempotency_key"},
        )
    payslip = await get_payslip(db, payslip_id)
    assert_calendar_month_payroll_actions_allowed(payslip.period_start, payslip.period_end)
    if payslip.status == PayslipStatus.APPROVED:
        if idempotency_key and payslip.approve_idempotency_key == idempotency_key:
            return payslip, False
        raise StateTransitionError("Payslip is already approved")
    if payslip.status != PayslipStatus.DRAFT:
        raise StateTransitionError("Only draft payslips can be approved")
    payslip.status = PayslipStatus.APPROVED
    payslip.approved_by_user_id = approver_user_id
    payslip.approved_at = datetime.now(UTC)
    if idempotency_key:
        payslip.approve_idempotency_key = idempotency_key
    await db.flush()
    br = await db.execute(
        select(User.branch_id)
        .join(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .where(EmployeeProfile.id == payslip.employee_profile_id)
    )
    branch_id = br.scalar_one_or_none()
    await post_payslip_approved_gl(db, payslip=payslip, branch_id=branch_id or 1)
    await db.flush()
    await db.refresh(payslip)
    return payslip, True


async def recalculate_draft_payslip(db: AsyncSession, *, payslip_id: int) -> Payslip:
    """Recompute SRS payroll components for a draft payslip."""
    payslip = await get_payslip(db, payslip_id)
    if payslip.status != PayslipStatus.DRAFT:
        raise StateTransitionError("Only draft payslips can be recalculated")
    await _get_employee_profile(db, payslip.employee_profile_id)

    manual = (
        payslip.manual_deductions_amount
        if payslip.manual_deductions_amount is not None
        else payslip.deductions
    )
    bonus = payslip.bonus_amount if payslip.bonus_amount is not None else Decimal("0")

    comp = await compute_period_payroll_components(
        db,
        employee_profile_id=payslip.employee_profile_id,
        period_start=payslip.period_start,
        period_end=payslip.period_end,
        bonus=bonus,
        manual_deductions=manual,
        hourly_rate_override=payslip.hourly_rate,
    )
    gross = comp["gross_amount"]
    net = comp["net_amount"]
    total_deductions = comp["total_deductions"]
    if net < Decimal("0"):
        raise ValidationError("Net amount cannot be negative after recalculation")
    h = _make_immutable_hash(
        employee_profile_id=payslip.employee_profile_id,
        period_start=payslip.period_start,
        period_end=payslip.period_end,
        hours_worked=comp["hours_worked"],
        hourly_rate=payslip.hourly_rate,
        gross_amount=gross,
        deductions=total_deductions,
        net_amount=net,
        bonus_amount=comp["bonus_amount"],
        automatic_deductions_amount=comp["automatic_deductions_amount"],
    )
    payslip.hours_worked = comp["hours_worked"]
    payslip.gross_amount = gross
    payslip.net_amount = net
    payslip.deductions = _q(total_deductions)
    payslip.base_salary_amount = comp["base_salary_amount"]
    payslip.bonus_amount = comp["bonus_amount"]
    payslip.overtime_amount = comp["overtime_amount"]
    payslip.automatic_deductions_amount = comp["automatic_deductions_amount"]
    payslip.manual_deductions_amount = comp["manual_deductions_amount"]
    payslip.calculation_details = comp["calculation_details"]
    payslip.immutable_hash = h
    await db.flush()
    await db.refresh(payslip)
    return payslip


async def export_approved_payslips_csv(db: AsyncSession) -> str:
    rows = await list_payslips(db, status=PayslipStatus.APPROVED.value)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "payslip_id",
            "employee_profile_id",
            "period_start",
            "period_end",
            "net_amount",
            "bank_account",
        ]
    )
    if not rows:
        return output.getvalue()

    profile_ids = [p.employee_profile_id for p in rows]
    profiles_result = await db.execute(
        select(EmployeeProfile).where(EmployeeProfile.id.in_(profile_ids))
    )
    profiles = {p.id: p for p in profiles_result.scalars().all()}

    for payslip in rows:
        profile = profiles.get(payslip.employee_profile_id)
        writer.writerow(
            [
                payslip.id,
                payslip.employee_profile_id,
                payslip.period_start.isoformat(),
                payslip.period_end.isoformat(),
                str(_q(payslip.net_amount)),
                profile.bank_account if profile else "",
            ]
        )
    return output.getvalue()


async def update_draft_payslip_adjustments(
    db: AsyncSession,
    *,
    payslip_id: int,
    bonus_amount: Decimal | None,
    manual_deductions: Decimal | None,
) -> Payslip:
    payslip = await get_payslip(db, payslip_id)
    if payslip.status != PayslipStatus.DRAFT:
        raise StateTransitionError("Only draft payslips can be adjusted")
    if bonus_amount is not None:
        if bonus_amount < Decimal("0"):
            raise ValidationError("bonus_amount must be >= 0")
        payslip.bonus_amount = bonus_amount
    if manual_deductions is not None:
        if manual_deductions < Decimal("0"):
            raise ValidationError("manual_deductions must be >= 0")
        payslip.manual_deductions_amount = manual_deductions
    await db.flush()
    return await recalculate_draft_payslip(db, payslip_id=payslip_id)


async def list_payroll_overview(
    db: AsyncSession, *, period_start: date, period_end: date
) -> list[dict]:
    enriched = await employee_service_module.list_employee_profiles_enriched(db)
    out: list[dict] = []
    for item in enriched:
        emp = item["employee"]
        ps_res = await db.execute(
            select(Payslip).where(
                Payslip.employee_profile_id == emp.id,
                Payslip.period_start == period_start,
                Payslip.period_end == period_end,
            )
        )
        ps = ps_res.scalar_one_or_none()
        preview: dict | None = None
        if ps is None:
            preview = await compute_period_payroll_components(
                db,
                employee_profile_id=emp.id,
                period_start=period_start,
                period_end=period_end,
                bonus=Decimal("0"),
                manual_deductions=Decimal("0"),
                hourly_rate_override=emp.hourly_rate,
            )
        out.append(
            {
                "employee_profile_id": emp.id,
                "user_email": item.get("user_email"),
                "user_full_name": item.get("user_full_name"),
                "user_role_code": item.get("user_role_code"),
                "base_salary": emp.base_salary,
                "hourly_rate": emp.hourly_rate,
                "payslip_id": ps.id if ps else None,
                "payslip_status": ps.status.value if ps else "no_payslip",
                "paid_at": ps.paid_at if ps else None,
                "gross_amount": ps.gross_amount if ps else preview["gross_amount"],
                "net_amount": ps.net_amount if ps else preview["net_amount"],
                "deductions_total": ps.deductions if ps else preview["total_deductions"],
                "automatic_deductions_amount": ps.automatic_deductions_amount
                if ps and ps.automatic_deductions_amount is not None
                else preview["automatic_deductions_amount"],
                "manual_deductions_amount": ps.manual_deductions_amount
                if ps and ps.manual_deductions_amount is not None
                else preview["manual_deductions_amount"],
                "bonus_amount": ps.bonus_amount
                if ps and ps.bonus_amount is not None
                else Decimal("0"),
                "overtime_amount": ps.overtime_amount if ps else preview["overtime_amount"],
                "base_salary_amount": ps.base_salary_amount
                if ps
                else preview["base_salary_amount"],
            }
        )
    return out


async def mark_payslips_paid_for_period(
    db: AsyncSession,
    *,
    period_start: date,
    period_end: date,
    actor_user_id: int,
) -> list[Payslip]:
    assert_calendar_month_payroll_actions_allowed(period_start, period_end)
    res = await db.execute(
        select(Payslip).where(
            Payslip.period_start == period_start,
            Payslip.period_end == period_end,
            Payslip.status == PayslipStatus.APPROVED,
            Payslip.paid_at.is_(None),
        )
    )
    rows = list(res.scalars().all())
    now = datetime.now(UTC)
    for p in rows:
        p.paid_at = now
        p.paid_by_user_id = actor_user_id
    await db.flush()
    return rows


async def approve_and_pay_period(
    db: AsyncSession,
    *,
    period_start: date,
    period_end: date,
    approver_user_id: int,
    idempotency_key: str | None,
) -> tuple[list[Payslip], list[Payslip]]:
    """Approve all draft payslips for the period, then mark approved rows as paid."""
    assert_calendar_month_payroll_actions_allowed(period_start, period_end)
    res = await db.execute(
        select(Payslip).where(
            Payslip.period_start == period_start,
            Payslip.period_end == period_end,
            Payslip.status == PayslipStatus.DRAFT,
        )
    )
    drafts = list(res.scalars().all())
    approved: list[Payslip] = []
    base_idem = idempotency_key or "approve-pay-batch"
    for p in drafts:
        idem = f"{base_idem}:approve:{p.id}"
        row, _ = await approve_payslip(
            db, payslip_id=p.id, approver_user_id=approver_user_id, idempotency_key=idem
        )
        approved.append(row)
    paid = await mark_payslips_paid_for_period(
        db,
        period_start=period_start,
        period_end=period_end,
        actor_user_id=approver_user_id,
    )
    return approved, paid


async def get_payroll_period_snapshot(
    db: AsyncSession,
    *,
    year: int,
    month: int,
) -> dict:
    """Calendar-month payroll workspace: overview rows plus summary and approval gate."""
    period_start, period_end = calendar_month_period_bounds(year, month)
    rows = await list_payroll_overview(db, period_start=period_start, period_end=period_end)
    opens = approval_opens_on_for_month(year, month)
    ref = _utc_today()
    approval_open = ref >= opens

    payslips_missing = 0
    payslips_draft = 0
    payslips_approved_unpaid = 0
    payslips_paid = 0
    gross_total = Decimal("0")
    net_total = Decimal("0")
    auto_total = Decimal("0")
    manual_total = Decimal("0")
    bonus_total = Decimal("0")

    for r in rows:
        st = r["payslip_status"]
        if st == "no_payslip":
            payslips_missing += 1
        elif st == PayslipStatus.DRAFT.value:
            payslips_draft += 1
        elif st == PayslipStatus.APPROVED.value:
            if r.get("paid_at"):
                payslips_paid += 1
            else:
                payslips_approved_unpaid += 1

        gross_total += _q(Decimal(str(r["gross_amount"])))
        net_total += _q(Decimal(str(r["net_amount"])))
        auto = r.get("automatic_deductions_amount")
        manual = r.get("manual_deductions_amount")
        bonus = r.get("bonus_amount")
        if auto is not None:
            auto_total += _q(Decimal(str(auto)))
        if manual is not None:
            manual_total += _q(Decimal(str(manual)))
        if bonus is not None:
            bonus_total += _q(Decimal(str(bonus)))

    return {
        "year": year,
        "month": month,
        "period_start": period_start,
        "period_end": period_end,
        "approval_opens_on": opens,
        "is_approval_open": approval_open,
        "rows": rows,
        "summary": {
            "employees_total": len(rows),
            "payslips_missing": payslips_missing,
            "payslips_draft": payslips_draft,
            "payslips_approved_unpaid": payslips_approved_unpaid,
            "payslips_paid": payslips_paid,
            "gross_total": gross_total,
            "net_total": net_total,
            "automatic_deductions_total": auto_total,
            "manual_deductions_total": manual_total,
            "bonus_total": bonus_total,
        },
    }


async def prepare_payroll_period_drafts(
    db: AsyncSession,
    *,
    year: int,
    month: int,
) -> dict:
    """Create draft payslips for all active employees for the calendar month (idempotent)."""
    period_start, period_end = calendar_month_period_bounds(year, month)
    enriched = await employee_service_module.list_employee_profiles_enriched(db)
    created_count = 0
    skipped_existing_count = 0
    skipped_inactive_count = 0
    failures: list[dict[str, object]] = []

    for item in enriched:
        emp = item["employee"]
        if item.get("user_status") != "active":
            skipped_inactive_count += 1
            continue
        idem = f"prepare-{year:04d}-{month:02d}-emp-{emp.id}"
        try:
            _payslip, was_created = await generate_payslip(
                db,
                employee_profile_id=emp.id,
                period_start=period_start,
                period_end=period_end,
                deductions=Decimal("0"),
                hourly_rate_override=None,
                bonus_amount=None,
                idempotency_key=idem,
            )
            if was_created:
                created_count += 1
            else:
                skipped_existing_count += 1
        except ValidationError as exc:
            msg = exc.message.lower()
            if "already exists" in msg:
                skipped_existing_count += 1
            else:
                failures.append({"employee_profile_id": emp.id, "message": exc.message})

    return {
        "year": year,
        "month": month,
        "period_start": period_start,
        "period_end": period_end,
        "created_count": created_count,
        "skipped_existing_count": skipped_existing_count,
        "skipped_inactive_count": skipped_inactive_count,
        "failures": failures,
    }
