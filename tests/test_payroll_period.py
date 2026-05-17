"""Monthly payroll period helpers, approval gate, PDF export, and payslip list enrichment."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from secrets import token_hex

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError
from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.payslip import Payslip, PayslipStatus
from app.models.users import User
from app.services.payroll_pdf_service import build_payroll_period_pdf
from app.services.payroll_service import (
    assert_calendar_month_payroll_actions_allowed,
    calendar_month_period_bounds,
    is_full_calendar_month_period,
    list_payslips_read,
)
from app.services.seed_service import seed_accounting_defaults, seed_permissions_and_roles
from app.utils.security import hash_password


def test_calendar_month_period_bounds_april() -> None:
    start, end = calendar_month_period_bounds(2026, 4)
    assert start == date(2026, 4, 1)
    assert end == date(2026, 4, 30)


def test_is_full_calendar_month_period_true() -> None:
    assert is_full_calendar_month_period(date(2026, 2, 1), date(2026, 2, 28)) is True


def test_is_full_calendar_month_period_partial_false() -> None:
    assert is_full_calendar_month_period(date(2026, 4, 1), date(2026, 4, 15)) is False


def test_assert_gate_skips_non_calendar_period(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.payroll_service._utc_today", lambda: date(2026, 4, 1))
    # Partial month — no gate
    assert_calendar_month_payroll_actions_allowed(date(2026, 4, 1), date(2026, 4, 15))


def test_assert_gate_blocks_before_open_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.payroll_service._utc_today", lambda: date(2026, 4, 20))
    with pytest.raises(ConflictError):
        assert_calendar_month_payroll_actions_allowed(date(2026, 4, 1), date(2026, 4, 30))


def test_assert_gate_allows_on_open_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.payroll_service._utc_today", lambda: date(2026, 4, 26))
    assert_calendar_month_payroll_actions_allowed(date(2026, 4, 1), date(2026, 4, 30))


def test_payroll_period_pdf_magic_bytes() -> None:
    raw = build_payroll_period_pdf(
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
        rows=[],
        title="Test",
    )
    assert raw[:4] == b"%PDF"


@pytest.mark.anyio
async def test_list_payslips_read_includes_user_and_period_filter(db_session: AsyncSession) -> None:
    await seed_permissions_and_roles(db_session)
    await seed_accounting_defaults(db_session)

    br_res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    branch = br_res.scalar_one_or_none()
    if branch is None:
        branch = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(branch)
        await db_session.flush()

    u = User(
        email="payslip_list_u@test.example",
        first_name="Listed Employee",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=branch.id,
    )
    db_session.add(u)
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2026, 1, 1),
        base_salary=None,
        hourly_rate=Decimal("10"),
    )
    db_session.add(ep)
    await db_session.flush()

    def slip(ps: date, pe: date, h: str) -> Payslip:
        return Payslip(
            employee_profile_id=ep.id,
            period_start=ps,
            period_end=pe,
            hours_worked=Decimal("0"),
            hourly_rate=Decimal("10"),
            deductions=Decimal("0"),
            gross_amount=Decimal("100"),
            net_amount=Decimal("100"),
            status=PayslipStatus.DRAFT,
            immutable_hash=h,
        )

    db_session.add(slip(date(2026, 4, 1), date(2026, 4, 30), token_hex(16)))
    db_session.add(slip(date(2026, 5, 1), date(2026, 5, 31), token_hex(16)))
    await db_session.commit()

    apr = await list_payslips_read(
        db_session,
        period_start=date(2026, 4, 1),
        period_end=date(2026, 4, 30),
    )
    assert len(apr) == 1
    assert apr[0].user_full_name == "Listed Employee"
    assert apr[0].user_email == "payslip_list_u@test.example"

    all_rows = await list_payslips_read(db_session)
    assert len(all_rows) == 2
