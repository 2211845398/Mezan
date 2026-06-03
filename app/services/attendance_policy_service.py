"""CRUD and defaults for attendance/payroll policies keyed by RBAC role code."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.attendance_payroll_policy import (
    AttendancePayrollPolicy,
    AttendancePolicyCategory,
)
from app.models.role import Role

DEFAULT_SPECS: list[dict] = [
    {"role_code": "OWNER", "attendance_category": AttendancePolicyCategory.EXEMPT.value},
    {"role_code": "ADMIN", "attendance_category": AttendancePolicyCategory.EXEMPT.value},
    {"role_code": "HR_MANAGER", "attendance_category": AttendancePolicyCategory.OFFICE.value},
    {"role_code": "ACCOUNTANT", "attendance_category": AttendancePolicyCategory.OFFICE.value},
    {"role_code": "IT_ADMIN", "attendance_category": AttendancePolicyCategory.OFFICE.value},
    {
        "role_code": "MARKETING_MANAGER",
        "attendance_category": AttendancePolicyCategory.OFFICE.value,
    },
    {
        "role_code": "CASHIER",
        "attendance_category": AttendancePolicyCategory.OPERATIONAL.value,
        "absence_deduction_amount": Decimal("20.00"),
        "early_close_deduction_amount": Decimal("15.00"),
    },
    {
        "role_code": "FLOOR_STAFF",
        "attendance_category": AttendancePolicyCategory.OPERATIONAL.value,
        "absence_deduction_amount": Decimal("20.00"),
    },
    {
        "role_code": "WAREHOUSE_MANAGER",
        "attendance_category": AttendancePolicyCategory.OPERATIONAL.value,
        "absence_deduction_amount": Decimal("35.00"),
    },
]


def _office_defaults() -> dict:
    return {
        "grace_minutes": 30,
        "absence_deduction_amount": Decimal("50.00"),
        "late_deduction_amount": Decimal("25.00"),
        "early_close_deduction_amount": Decimal("0.00"),
        "overtime_multiplier": Decimal("1.50"),
    }


def _operational_defaults() -> dict:
    return {
        "grace_minutes": 0,
        "absence_deduction_amount": Decimal("20.00"),
        "late_deduction_amount": Decimal("10.00"),
        "early_close_deduction_amount": Decimal("15.00"),
        "overtime_multiplier": Decimal("1.50"),
    }


def _exempt_defaults() -> dict:
    return {
        "grace_minutes": 0,
        "absence_deduction_amount": Decimal("0"),
        "late_deduction_amount": Decimal("0"),
        "early_close_deduction_amount": Decimal("0"),
        "overtime_multiplier": Decimal("1.50"),
    }


def materialize_spec_row(spec: dict) -> dict:
    cat = spec["attendance_category"]
    base = (
        _exempt_defaults()
        if cat == AttendancePolicyCategory.EXEMPT.value
        else _operational_defaults()
        if cat == AttendancePolicyCategory.OPERATIONAL.value
        else _office_defaults()
    )
    row = {**base, **spec}
    return row


async def seed_default_policies(db: AsyncSession) -> int:
    """Insert default policies for known role codes when missing. Returns rows inserted."""
    inserted = 0
    for spec in DEFAULT_SPECS:
        rc = spec["role_code"]
        exists = await db.execute(
            select(AttendancePayrollPolicy.id).where(AttendancePayrollPolicy.role_code == rc)
        )
        if exists.scalar_one_or_none():
            continue
        role_chk = await db.execute(select(Role.id).where(Role.code == rc))
        if role_chk.scalar_one_or_none() is None:
            continue
        data = materialize_spec_row(spec)
        p = AttendancePayrollPolicy(**data)
        db.add(p)
        inserted += 1
    if inserted:
        await db.flush()
    return inserted


async def list_policies(db: AsyncSession) -> list[AttendancePayrollPolicy]:
    res = await db.execute(
        select(AttendancePayrollPolicy).order_by(AttendancePayrollPolicy.role_code.asc())
    )
    return list(res.scalars().all())


async def get_policy_by_role_code(
    db: AsyncSession, role_code: str
) -> AttendancePayrollPolicy | None:
    if not role_code:
        return None
    res = await db.execute(
        select(AttendancePayrollPolicy).where(
            AttendancePayrollPolicy.role_code == role_code.upper()
        )
    )
    return res.scalar_one_or_none()


async def upsert_policy(
    db: AsyncSession,
    *,
    role_code: str,
    attendance_category: str,
    grace_minutes: int,
    absence_deduction_amount: Decimal,
    late_deduction_amount: Decimal,
    early_close_deduction_amount: Decimal,
    overtime_multiplier: Decimal,
    is_active: bool = True,
) -> AttendancePayrollPolicy:
    rc = role_code.strip().upper()
    if not rc:
        raise ValidationError("role_code is required")
    if attendance_category not in {c.value for c in AttendancePolicyCategory}:
        raise ValidationError(
            "Invalid attendance_category",
            details={"allowed": [c.value for c in AttendancePolicyCategory]},
        )
    role_res = await db.execute(select(Role).where(Role.code == rc))
    if role_res.scalar_one_or_none() is None:
        raise NotFoundError("Role code not found", details={"role_code": rc})
    if grace_minutes < 0 or grace_minutes > 24 * 60:
        raise ValidationError("grace_minutes out of range")
    if overtime_multiplier < Decimal("1"):
        raise ValidationError("overtime_multiplier must be >= 1")

    existing = await get_policy_by_role_code(db, rc)
    now = datetime.now(UTC)
    if existing:
        existing.attendance_category = attendance_category
        existing.grace_minutes = grace_minutes
        existing.absence_deduction_amount = absence_deduction_amount
        existing.late_deduction_amount = late_deduction_amount
        existing.early_close_deduction_amount = early_close_deduction_amount
        existing.overtime_multiplier = overtime_multiplier
        existing.is_active = is_active
        existing.updated_at = now
        await db.flush()
        await db.refresh(existing)
        return existing

    row = materialize_spec_row(
        {
            "role_code": rc,
            "attendance_category": attendance_category,
        }
    )
    row.update(
        {
            "grace_minutes": grace_minutes,
            "absence_deduction_amount": absence_deduction_amount,
            "late_deduction_amount": late_deduction_amount,
            "early_close_deduction_amount": early_close_deduction_amount,
            "overtime_multiplier": overtime_multiplier,
            "is_active": is_active,
        }
    )
    p = AttendancePayrollPolicy(**row)
    db.add(p)
    await db.flush()
    await db.refresh(p)
    return p


async def resolve_effective_policy(
    db: AsyncSession, *, role_code: str | None
) -> AttendancePayrollPolicy | dict:
    """Return DB row or in-memory defaults for unknown / null role."""
    if role_code:
        row = await get_policy_by_role_code(db, role_code.strip().upper())
        if row and row.is_active:
            return row
    # Fallback: office defaults as dict (not persisted)
    return materialize_spec_row(
        {
            "role_code": (role_code or "UNKNOWN").upper(),
            "attendance_category": AttendancePolicyCategory.OFFICE.value,
        }
    )
