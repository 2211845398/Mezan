"""GET /attendance/logs paginated list with date filters and employee enrichment."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance_log import AttendanceLog
from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.users import User
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import hash_password

_UNIQUE = "zzattpag01"


@pytest.mark.anyio
async def test_list_attendance_logs_paginated_with_total_and_enrichment(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_auth_header: dict[str, str],
) -> None:
    await seed_permissions_and_roles(db_session)

    br_res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = br_res.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    email = f"{_UNIQUE}@test.example"
    u = User(
        email=email,
        first_name="Attend",
        father_name="Pag",
        family_name=_UNIQUE,
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2025, 6, 1),
        base_salary=Decimal("4500.00"),
        hourly_rate=Decimal("25.00"),
    )
    db_session.add(ep)
    await db_session.flush()

    day = date(2025, 6, 15)
    base_in = datetime.combine(day, time(8, 0), tzinfo=UTC)
    for i in range(12):
        db_session.add(
            AttendanceLog(
                employee_profile_id=ep.id,
                branch_id=store.id,
                clock_in_at=base_in + timedelta(minutes=i),
                attendance_category="office",
                classification_status="present",
            )
        )
    await db_session.commit()

    day_str = day.isoformat()
    first = await client.get(
        "/api/v1/attendance/logs",
        params={
            "date_from": day_str,
            "date_to": day_str,
            "limit": 10,
            "offset": 0,
        },
        headers=admin_auth_header,
    )
    assert first.status_code == 200, first.text
    payload = first.json()
    assert payload["total"] == 12
    assert payload["limit"] == 10
    assert payload["offset"] == 0
    assert len(payload["items"]) == 10
    assert payload["items"][0]["employee_user_email"] == email
    assert payload["items"][0]["employee_user_full_name"]

    second = await client.get(
        "/api/v1/attendance/logs",
        params={
            "date_from": day_str,
            "date_to": day_str,
            "limit": 10,
            "offset": 10,
        },
        headers=admin_auth_header,
    )
    assert second.status_code == 200, second.text
    payload2 = second.json()
    assert payload2["total"] == 12
    assert len(payload2["items"]) == 2

    scoped = await client.get(
        "/api/v1/attendance/logs",
        params={
            "date_from": day_str,
            "date_to": day_str,
            "employee_profile_id": ep.id,
            "limit": 5,
            "offset": 0,
        },
        headers=admin_auth_header,
    )
    assert scoped.status_code == 200, scoped.text
    assert scoped.json()["total"] == 12
