"""Payroll calculation and export services (Epic 4.3/4.4)."""

from __future__ import annotations

import csv
import hashlib
import io
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, StateTransitionError, ValidationError
from app.models.attendance_log import AttendanceLog
from app.models.employee_profile import EmployeeProfile
from app.models.payslip import Payslip, PayslipStatus
from app.models.users import User
from app.services.document_posting_service import post_payslip_approved_gl

MONEY_Q = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(MONEY_Q, rounding=ROUND_HALF_UP)


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
    deductions: Decimal,
    net_amount: Decimal,
) -> str:
    raw = (
        f"{employee_profile_id}|{period_start.isoformat()}|{period_end.isoformat()}|"
        f"{hours_worked}|{hourly_rate}|{deductions}|{net_amount}"
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
    idempotency_key: str | None = None,
) -> tuple[Payslip, bool]:
    """Returns (payslip, created). When idempotency_key replays, created is False."""
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

    rate = hourly_rate_override if hourly_rate_override is not None else employee.hourly_rate
    if rate is None:
        raise ValidationError("Employee hourly_rate is required to compute payroll")
    if deductions < Decimal("0"):
        raise ValidationError("deductions must be >= 0")

    hours_worked = await _compute_hours_worked(
        db,
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
    )
    gross = _q(hours_worked * rate)
    net = _q(gross - deductions)
    if net < Decimal("0"):
        raise ValidationError("Net amount cannot be negative")

    h = _make_immutable_hash(
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
        hours_worked=hours_worked,
        hourly_rate=_q(rate),
        deductions=_q(deductions),
        net_amount=net,
    )
    payslip = Payslip(
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
        hours_worked=hours_worked,
        hourly_rate=_q(rate),
        deductions=_q(deductions),
        gross_amount=gross,
        net_amount=net,
        status=PayslipStatus.DRAFT,
        immutable_hash=h,
        generate_idempotency_key=idempotency_key,
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
    """Recompute hours and gross/net for a draft payslip; keeps period, hourly_rate, and deductions."""
    payslip = await get_payslip(db, payslip_id)
    if payslip.status != PayslipStatus.DRAFT:
        raise StateTransitionError("Only draft payslips can be recalculated")
    await _get_employee_profile(db, payslip.employee_profile_id)
    hours_worked = await _compute_hours_worked(
        db,
        employee_profile_id=payslip.employee_profile_id,
        period_start=payslip.period_start,
        period_end=payslip.period_end,
    )
    rate = payslip.hourly_rate
    gross = _q(hours_worked * rate)
    net = _q(gross - payslip.deductions)
    if net < Decimal("0"):
        raise ValidationError("Net amount cannot be negative after recalculation")
    h = _make_immutable_hash(
        employee_profile_id=payslip.employee_profile_id,
        period_start=payslip.period_start,
        period_end=payslip.period_end,
        hours_worked=hours_worked,
        hourly_rate=rate,
        deductions=payslip.deductions,
        net_amount=net,
    )
    payslip.hours_worked = hours_worked
    payslip.gross_amount = gross
    payslip.net_amount = net
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
