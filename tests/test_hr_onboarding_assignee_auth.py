"""HR onboarding: assignee-only access when assigned; open queue when unassigned."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Role
from app.models.user_onboarding import UserOnboarding
from app.models.user_role import UserRole
from app.models.users import User
from app.services import email_service
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import create_access_token, hash_password

_COMPLETE_BODY = {"contract_start": "2026-01-01", "salary_amount": "1500.00"}


async def _create_hr_user(db_session: AsyncSession, email: str) -> User:
    res = await db_session.execute(select(Role).where(Role.code == "HR_MANAGER"))
    hr_role = res.scalar_one()
    user = User(
        email=email,
        first_name="HR",
        password_hash=hash_password("password123"),
        status="active",
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserRole(user_id=user.id, role_id=hr_role.id, branch_id=None))
    await db_session.flush()
    return user


async def _create_pending_onboarding(
    db_session: AsyncSession,
    *,
    assigned_hr_user_id: int | None = None,
) -> UserOnboarding:
    user = User(
        email=f"pending-{uuid.uuid4().hex[:8]}@test.local",
        first_name="Pending",
        status="pending_onboarding",
        password_hash=None,
    )
    db_session.add(user)
    await db_session.flush()
    task = UserOnboarding(
        user_id=user.id,
        status="pending",
        assigned_hr_user_id=assigned_hr_user_id,
    )
    db_session.add(task)
    await db_session.flush()
    return task


def _auth_header(user_id: int) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


@pytest.mark.asyncio
async def test_can_complete_onboarding_assigned_only(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Assigned reviewer A may complete; admin B may not when a reviewer is set."""
    await seed_permissions_and_roles(db_session)
    hr_a = await _create_hr_user(db_session, "hr-a-assignee@test.local")
    task = await _create_pending_onboarding(db_session, assigned_hr_user_id=hr_a.id)
    await db_session.commit()

    monkeypatch.setattr(email_service, "send_email", AsyncMock())

    blocked = await client.post(
        f"/api/v1/hr/onboarding/{task.id}/complete",
        json=_COMPLETE_BODY,
        headers=admin_auth_header,
    )
    assert blocked.status_code == 403
    assert (
        blocked.json()["error"]["details"]["detail"]
        == "Only the assigned onboarding reviewer can complete this task"
    )

    allowed = await client.post(
        f"/api/v1/hr/onboarding/{task.id}/complete",
        json=_COMPLETE_BODY,
        headers=_auth_header(hr_a.id),
    )
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_can_complete_onboarding_unassigned_any_updater(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Without assignee, any user with onboarding:update may complete."""
    await seed_permissions_and_roles(db_session)
    hr_b = await _create_hr_user(db_session, "hr-b-unassigned@test.local")
    task = await _create_pending_onboarding(db_session, assigned_hr_user_id=None)
    await db_session.commit()

    monkeypatch.setattr(email_service, "send_email", AsyncMock())

    resp = await client.post(
        f"/api/v1/hr/onboarding/{task.id}/complete",
        json=_COMPLETE_BODY,
        headers=_auth_header(hr_b.id),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_list_pending_onboarding_filters_by_assignee(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """HR-B does not see tasks assigned to HR-A; unassigned tasks remain visible."""
    await seed_permissions_and_roles(db_session)
    hr_a = await _create_hr_user(db_session, "hr-a-list@test.local")
    hr_b = await _create_hr_user(db_session, "hr-b-list@test.local")
    assigned_task = await _create_pending_onboarding(db_session, assigned_hr_user_id=hr_a.id)
    open_task = await _create_pending_onboarding(db_session, assigned_hr_user_id=None)
    await db_session.commit()

    hr_a_list = await client.get(
        "/api/v1/hr/onboarding/pending",
        headers=_auth_header(hr_a.id),
    )
    assert hr_a_list.status_code == 200
    hr_a_ids = {row["id"] for row in hr_a_list.json()}
    assert assigned_task.id in hr_a_ids
    assert open_task.id in hr_a_ids

    hr_b_list = await client.get(
        "/api/v1/hr/onboarding/pending",
        headers=_auth_header(hr_b.id),
    )
    assert hr_b_list.status_code == 200
    hr_b_ids = {row["id"] for row in hr_b_list.json()}
    assert assigned_task.id not in hr_b_ids
    assert open_task.id in hr_b_ids
