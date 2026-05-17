"""API tests for user create assignee validation and onboarding-assignees list."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.utils.security import hash_password


@pytest.mark.asyncio
async def test_create_user_invalid_email_returns_422(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    """Pydantic / FastAPI validation uses 422 with envelope ``details.errors``."""
    resp = await client.post(
        "/api/v1/users",
        json={"email": "not-an-email"},
        headers=admin_auth_header,
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"]["code"] == "validation_error"
    assert "errors" in body["error"]["details"]


@pytest.mark.asyncio
async def test_create_user_duplicate_email_returns_machine_code(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    """Duplicate email is rejected in the route after schema validation (HTTP 400, not 422)."""
    resp = await client.post(
        "/api/v1/users",
        json={"email": "admin@example.com", "first_name": "Dup"},
        headers=admin_auth_header,
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["details"]["detail"] == "email_already_exists"


@pytest.mark.asyncio
async def test_create_user_rejects_ineligible_assignee(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session,
) -> None:
    role_res = await db_session.execute(select(Role).where(Role.code == "CASHIER"))
    cashier_role = role_res.scalar_one()
    cashier = User(
        email="only_cashier_assignee@test.local",
        first_name="Cashier",
        father_name=None,
        family_name=None,
        password_hash=hash_password("password123"),
        status="active",
        branch_id=None,
    )
    db_session.add(cashier)
    await db_session.flush()
    db_session.add(UserRole(user_id=cashier.id, role_id=cashier_role.id, branch_id=None))
    await db_session.commit()

    resp = await client.post(
        "/api/v1/users",
        json={
            "email": "new_staff_assignee@example.com",
            "first_name": "Staff",
            "assigned_hr_user_id": cashier.id,
        },
        headers=admin_auth_header,
    )
    assert resp.status_code == 422

    res_json = resp.json()
    error_obj = res_json.get("error", {}) or {}
    details = error_obj.get("details") or {}

    # Machine id may live under details.detail (AppError) or error.code (stable id)
    actual_error = details.get("detail") or error_obj.get("code")
    assert actual_error == "onboarding_assignee_ineligible", res_json


@pytest.mark.asyncio
async def test_list_onboarding_assignees_includes_admin(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    resp = await client.get("/api/v1/users/onboarding-assignees", headers=admin_auth_header)
    assert resp.status_code == 200
    users = resp.json()
    assert any(u.get("email") == "admin@example.com" for u in users)
