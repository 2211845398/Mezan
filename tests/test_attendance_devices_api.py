"""Attendance kiosk device management and signed QR payloads."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import date
from decimal import Decimal

from app.core.errors import ValidationError
from app.models.attendance_device import AttendanceDevice
from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.services.attendance_device_service import create_attendance_device, ensure_kiosk_role_for_user
from app.services.attendance_qr_service import (
    QR_PREFIX,
    QR_TTL_SECONDS,
    build_signed_attendance_qr_payload,
    resolve_branch_from_qr_payload,
)
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import create_access_token, hash_password


@pytest.mark.asyncio
async def test_signed_qr_round_trip(db_session: AsyncSession) -> None:
    await seed_permissions_and_roles(db_session)
    branch = Branch(name="QR Branch", code="QR1", address=None, timezone="UTC", is_active=True)
    db_session.add(branch)
    await db_session.flush()

    device = await create_attendance_device(
        db_session,
        branch_id=branch.id,
        name="Lobby",
        device_code="KIOSK-QR1",
        kiosk_email="kiosk_qr1@test.example",
        kiosk_password="password1",
        kiosk_first_name="Lobby",
    )
    payload = build_signed_attendance_qr_payload(
        branch_id=branch.id,
        device_id=device.id,
        token_version=device.qr_token_version,
    )
    resolved = await resolve_branch_from_qr_payload(db_session, payload)
    assert resolved == branch.id


@pytest.mark.asyncio
async def test_v1_qr_still_supported(db_session: AsyncSession) -> None:
    branch = Branch(name="Legacy", code="LEG1", address=None, timezone="UTC", is_active=True)
    db_session.add(branch)
    await db_session.flush()
    resolved = await resolve_branch_from_qr_payload(
        db_session,
        f"{QR_PREFIX}{branch.id}",
    )
    assert resolved == branch.id


@pytest.mark.security
@pytest.mark.asyncio
async def test_hr_lists_devices_and_kiosk_reads_qr(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)

    branch = Branch(name="Main", code="MAIN-DEV", address=None, timezone="UTC", is_active=True)
    db_session.add(branch)
    await db_session.flush()

    res_hr_role = await db_session.execute(select(Role).where(Role.code == "HR_MANAGER"))
    hr_role = res_hr_role.scalar_one()
    res_kiosk_role = await db_session.execute(select(Role).where(Role.code == "ATTENDANCE_KIOSK"))
    kiosk_role = res_kiosk_role.scalar_one()

    hr_user = User(
        email="hr_devices@test.example",
        first_name="HR",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=branch.id,
    )
    kiosk_user = User(
        email="kiosk_devices@test.example",
        first_name="Kiosk",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=branch.id,
    )
    db_session.add_all([hr_user, kiosk_user])
    await db_session.flush()
    db_session.add(UserRole(user_id=hr_user.id, role_id=hr_role.id, branch_id=None))
    db_session.add(UserRole(user_id=kiosk_user.id, role_id=kiosk_role.id, branch_id=branch.id))
    await db_session.flush()

    device = await create_attendance_device(
        db_session,
        branch_id=branch.id,
        name="Front desk",
        device_code="KIOSK-FRONT",
        user_id=kiosk_user.id,
    )
    await ensure_kiosk_role_for_user(db_session, user_id=kiosk_user.id)
    await db_session.commit()

    hr_headers = {"Authorization": f"Bearer {create_access_token(hr_user.id)}"}
    kiosk_headers = {"Authorization": f"Bearer {create_access_token(kiosk_user.id)}"}

    listed = await client.get("/api/v1/attendance-devices", headers=hr_headers)
    assert listed.status_code == 200
    assert any(row["id"] == device.id for row in listed.json())

    kiosk_qr = await client.get("/api/v1/attendance-devices/me/qr", headers=kiosk_headers)
    assert kiosk_qr.status_code == 200
    body = kiosk_qr.json()
    assert body["qr_payload"].startswith("mezan:attendance:v2:")
    assert body["branch_id"] == branch.id

    generated = await client.post(
        "/api/v1/attendance-devices/me/qr/generate",
        headers=kiosk_headers,
    )
    assert generated.status_code == 200
    generated_body = generated.json()
    assert generated_body["qr_payload"].startswith("mezan:attendance:v2:")
    assert generated_body["device_id"] == device.id
    assert generated_body["qr_payload"] != body["qr_payload"]

    preview = await client.get(
        f"/api/v1/attendance-devices/{device.id}/qr",
        headers=hr_headers,
    )
    assert preview.status_code == 200

    forbidden = await client.get("/api/v1/attendance-devices/me/qr", headers=hr_headers)
    assert forbidden.status_code in (403, 404)


@pytest.mark.security
@pytest.mark.asyncio
async def test_kiosk_reads_own_device_qr_by_id_forbidden_for_other(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)

    branch = Branch(name="South", code="SOUTH-DEV", address=None, timezone="UTC", is_active=True)
    db_session.add(branch)
    await db_session.flush()

    res_kiosk_role = await db_session.execute(select(Role).where(Role.code == "ATTENDANCE_KIOSK"))
    kiosk_role = res_kiosk_role.scalar_one()

    kiosk_user_a = User(
        email="kiosk_a@test.example",
        first_name="KioskA",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=branch.id,
    )
    kiosk_user_b = User(
        email="kiosk_b@test.example",
        first_name="KioskB",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=branch.id,
    )
    db_session.add_all([kiosk_user_a, kiosk_user_b])
    await db_session.flush()
    db_session.add(UserRole(user_id=kiosk_user_a.id, role_id=kiosk_role.id, branch_id=branch.id))
    db_session.add(UserRole(user_id=kiosk_user_b.id, role_id=kiosk_role.id, branch_id=branch.id))
    await db_session.flush()

    device_a = await create_attendance_device(
        db_session,
        branch_id=branch.id,
        name="Kiosk A",
        device_code="KIOSK-A",
        user_id=kiosk_user_a.id,
    )
    device_b = await create_attendance_device(
        db_session,
        branch_id=branch.id,
        name="Kiosk B",
        device_code="KIOSK-B",
        user_id=kiosk_user_b.id,
    )
    await ensure_kiosk_role_for_user(db_session, user_id=kiosk_user_a.id)
    await ensure_kiosk_role_for_user(db_session, user_id=kiosk_user_b.id)
    await db_session.commit()

    headers_a = {"Authorization": f"Bearer {create_access_token(kiosk_user_a.id)}"}

    own_qr = await client.get(
        f"/api/v1/attendance-devices/{device_a.id}/qr",
        headers=headers_a,
    )
    assert own_qr.status_code == 200
    assert own_qr.json()["device_id"] == device_a.id

    other_qr = await client.get(
        f"/api/v1/attendance-devices/{device_b.id}/qr",
        headers=headers_a,
    )
    assert other_qr.status_code == 403


@pytest.mark.security
@pytest.mark.asyncio
async def test_hr_creates_device_with_new_kiosk_user(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)

    branch = Branch(name="North", code="NORTH-DEV", address=None, timezone="UTC", is_active=True)
    db_session.add(branch)
    await db_session.flush()

    res_hr_role = await db_session.execute(select(Role).where(Role.code == "HR_MANAGER"))
    hr_role = res_hr_role.scalar_one()
    hr_user = User(
        email="hr_create_devices@test.example",
        first_name="HR",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=branch.id,
    )
    db_session.add(hr_user)
    await db_session.flush()
    db_session.add(UserRole(user_id=hr_user.id, role_id=hr_role.id, branch_id=None))
    await db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(hr_user.id)}"}
    created = await client.post(
        "/api/v1/attendance-devices",
        headers=headers,
        json={
            "branch_id": branch.id,
            "name": "Side door",
            "kiosk_email": "kiosk_side@test.example",
            "kiosk_password": "password1",
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["user_email"] == "kiosk_side@test.example"
    assert body["device_code"].startswith("KIOSK-NORTHDEV-")

    res_u = await db_session.execute(select(User).where(User.email == "kiosk_side@test.example"))
    kiosk_user = res_u.scalar_one()
    kiosk_headers = {"Authorization": f"Bearer {create_access_token(kiosk_user.id)}"}
    qr = await client.get("/api/v1/attendance-devices/me/qr", headers=kiosk_headers)
    assert qr.status_code == 200

    res_device = await db_session.execute(
        select(AttendanceDevice).where(AttendanceDevice.id == body["id"])
    )
    assert res_device.scalar_one().user_id == kiosk_user.id


@pytest.mark.security
@pytest.mark.asyncio
async def test_employee_request_qr_rotates_kiosk_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)

    branch = Branch(name="East", code="EAST-DEV", address=None, timezone="UTC", is_active=True)
    db_session.add(branch)
    await db_session.flush()

    res_cashier = await db_session.execute(select(Role).where(Role.code == "CASHIER"))
    cashier_role = res_cashier.scalar_one()
    res_kiosk_role = await db_session.execute(select(Role).where(Role.code == "ATTENDANCE_KIOSK"))
    kiosk_role = res_kiosk_role.scalar_one()

    kiosk_user = User(
        email="kiosk_request_qr@test.example",
        first_name="Kiosk",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=branch.id,
    )
    employee_user = User(
        email="employee_request_qr@test.example",
        first_name="Employee",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=branch.id,
    )
    db_session.add_all([kiosk_user, employee_user])
    await db_session.flush()

    db_session.add(
        EmployeeProfile(
            user_id=employee_user.id,
            hire_date=date(2025, 1, 1),
            base_salary=None,
            hourly_rate=Decimal("10.00"),
        )
    )
    db_session.add(UserRole(user_id=employee_user.id, role_id=cashier_role.id, branch_id=None))
    db_session.add(UserRole(user_id=kiosk_user.id, role_id=kiosk_role.id, branch_id=branch.id))
    await db_session.flush()

    device = await create_attendance_device(
        db_session,
        branch_id=branch.id,
        name="Lobby",
        device_code="KIOSK-EAST",
        user_id=kiosk_user.id,
    )
    await ensure_kiosk_role_for_user(db_session, user_id=kiosk_user.id)
    await db_session.commit()

    old_version = device.qr_token_version
    old_qr = build_signed_attendance_qr_payload(
        branch_id=branch.id,
        device_id=device.id,
        token_version=old_version,
    )

    employee_headers = {"Authorization": f"Bearer {create_access_token(employee_user.id)}"}
    response = await client.post(
        "/api/v1/employees/me/attendance/request-qr",
        headers=employee_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True, "expires_in_seconds": QR_TTL_SECONDS}

    await db_session.refresh(device)
    assert device.qr_token_version == old_version + 1

    with pytest.raises(ValidationError):
        await resolve_branch_from_qr_payload(db_session, old_qr)
