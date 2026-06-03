"""Tests for DEFAULT_ADMIN_EMAIL bootstrap user guards."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.models.users import User
from app.services import bootstrap_admin_protection as bap


def _user(email: str) -> User:
    now = datetime.now(UTC)
    return User(
        id=1,
        email=email,
        password_hash="hashed",
        status="active",
        created_at=now,
        updated_at=now,
    )


def test_is_bootstrap_protected_matches_configured_email_case_insensitive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "Owner@Example.com")
    u = _user("  owner@example.com  ")
    assert bap.is_bootstrap_protected_user(u) is True


def test_not_protected_when_config_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", None)
    u = _user("owner@example.com")
    assert bap.is_bootstrap_protected_user(u) is False


def test_deactivate_blocked_for_protected_user(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "owner@example.com")
    u = _user("owner@example.com")
    with pytest.raises(HTTPException) as exc:
        bap.assert_bootstrap_admin_may_not_be_deactivated(u, "deactivated")
    assert exc.value.status_code == 403
    assert exc.value.detail == "bootstrap_admin_status_must_remain_active"


def test_pending_onboarding_blocked_for_protected_user(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "owner@example.com")
    u = _user("owner@example.com")
    with pytest.raises(HTTPException) as exc:
        bap.assert_bootstrap_admin_may_not_be_deactivated(u, "pending_onboarding")
    assert exc.value.status_code == 403


def test_active_allowed_for_protected_user(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "owner@example.com")
    u = _user("owner@example.com")
    bap.assert_bootstrap_admin_may_not_be_deactivated(u, "active")


def test_remove_admin_role_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "owner@example.com")
    u = _user("owner@example.com")
    with pytest.raises(HTTPException) as exc:
        bap.assert_bootstrap_admin_admin_role_not_removed(u, "ADMIN")
    assert exc.value.status_code == 403


def test_password_reset_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "owner@example.com")
    u = _user("owner@example.com")
    with pytest.raises(HTTPException) as exc:
        bap.assert_bootstrap_admin_password_reset_forbidden(u)
    assert exc.value.status_code == 403


def test_permission_overrides_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "owner@example.com")
    u = _user("owner@example.com")
    with pytest.raises(HTTPException) as exc:
        bap.assert_bootstrap_admin_permission_overrides_forbidden(u)
    assert exc.value.status_code == 403


def test_add_roles_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "owner@example.com")
    u = _user("owner@example.com")
    with pytest.raises(HTTPException) as exc:
        bap.assert_bootstrap_admin_may_not_add_roles(u)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_api_blocks_deactivate_when_config_matches(
    client,
    admin_auth_header: dict[str, str],
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Requires TEST_DATABASE_URL (same as conftest client fixture)."""

    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "admin@example.com")
    from sqlalchemy import select

    res = await db_session.execute(select(User).where(User.email == "admin@example.com"))
    user = res.scalar_one()
    resp = await client.patch(
        f"/api/v1/users/{user.id}",
        headers=admin_auth_header,
        json={"status": "deactivated"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["details"]["detail"] == "bootstrap_admin_status_must_remain_active"


@pytest.mark.asyncio
async def test_api_blocks_remove_admin_role_when_config_matches(
    client,
    admin_auth_header: dict[str, str],
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", "admin@example.com")
    from sqlalchemy import select

    from app.models.role import Role
    from app.services.seed_service import ADMIN_ROLE_NAME

    res = await db_session.execute(select(User).where(User.email == "admin@example.com"))
    user = res.scalar_one()
    rres = await db_session.execute(select(Role).where(Role.name == ADMIN_ROLE_NAME))
    role = rres.scalar_one()

    resp = await client.request(
        "DELETE",
        f"/api/v1/users/{user.id}/roles",
        headers=admin_auth_header,
        json={"role_id": role.id, "branch_id": None},
    )
    assert resp.status_code == 403
    assert (
        resp.json()["error"]["details"]["detail"] == "bootstrap_admin_admin_role_cannot_be_removed"
    )
