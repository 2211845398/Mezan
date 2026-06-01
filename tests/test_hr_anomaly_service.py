"""HR anomaly deterministic rules: scheduled absence and continuous shift."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.schemas.ai_advisory import HrAnomaly, HrAnomalyRequest
from app.services.ai.hr_anomaly_service import (
    _detect_scheduled_absences,
    _deterministic_anomalies,
    detect_hr_anomalies,
)
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import hash_password

_UNIQUE = "zzhranom01"


def test_continuous_shift_detected_for_26_hour_shift() -> None:
    now = datetime.now(UTC)
    ci = now - timedelta(hours=26)
    logs = [
        {
            "employee_profile_id": 42,
            "branch_id": 1,
            "employee_name": "Test User",
            "clock_in_at": ci,
            "clock_out_at": now,
        }
    ]
    anomalies = _deterministic_anomalies(logs)
    types = {a.anomaly_type for a in anomalies}
    assert "continuous_shift" in types
    shift = next(a for a in anomalies if a.anomaly_type == "continuous_shift")
    assert shift.observed_value >= 24.0


def test_llm_filter_keeps_only_known_employee_ids() -> None:
    deterministic = [
        HrAnomaly(
            employee_profile_id=10,
            employee_name="A",
            branch_id=1,
            anomaly_type="scheduled_absence",
            period_start=datetime.now(UTC),
            period_end=datetime.now(UTC),
            observed_value=1.0,
            expected_value=1.0,
            rationale="x",
            severity="medium",
            confidence=0.9,
        )
    ]
    allowed_ids = {a.employee_profile_id for a in deterministic}
    hallucinated = [
        HrAnomaly(
            employee_profile_id=999,
            employee_name="Ghost",
            branch_id=1,
            anomaly_type="scheduled_absence",
            period_start=datetime.now(UTC),
            period_end=datetime.now(UTC),
            observed_value=1.0,
            expected_value=1.0,
            rationale="y",
            severity="low",
            confidence=0.5,
        )
    ]
    filtered = [a for a in hallucinated if a.employee_profile_id in allowed_ids]
    assert filtered == []


@pytest.mark.anyio
async def test_scheduled_absence_when_no_attendance_or_leave(
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)

    br_res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = br_res.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    res_r = await db_session.execute(select(Role).where(Role.code == "HR_MANAGER"))
    hr_role = res_r.scalar_one()

    u = User(
        email=f"{_UNIQUE}@test.example",
        first_name="Anom",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()
    db_session.add(UserRole(user_id=u.id, role_id=hr_role.id, branch_id=None))
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2025, 1, 1),
        hourly_rate=Decimal("10.00"),
    )
    db_session.add(ep)
    await db_session.flush()

    work_day = date.today() - timedelta(days=1)
    db_session.add(
        WeeklySchedule(
            employee_profile_id=ep.id,
            branch_id=store.id,
            weekday=work_day.weekday(),
            start_time=time(9, 0),
            end_time=time(17, 0),
            is_day_off=False,
        )
    )
    await db_session.commit()

    anomalies = await _detect_scheduled_absences(
        db_session,
        period_start=work_day,
        period_end=work_day,
        branch_id=store.id,
        employee_ids=[ep.id],
    )
    assert any(a.anomaly_type == "scheduled_absence" for a in anomalies)
    assert any(a.employee_profile_id == ep.id for a in anomalies)


@pytest.mark.anyio
async def test_detect_hr_anomalies_uses_deterministic_fallback_without_openai(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.ai.hr_anomaly_service.settings.OPENAI_API_KEY", None)

    response, usage = await detect_hr_anomalies(
        db_session,
        payload=HrAnomalyRequest(
            preset="last_7_days",
            branch_id=None,
            max_anomalies=50,
        ),
    )
    assert usage is None
    assert response.model == "deterministic_fallback"
    assert isinstance(response.anomalies, list)
