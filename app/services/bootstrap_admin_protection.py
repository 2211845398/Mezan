"""Guards for the seeded bootstrap admin (DEFAULT_ADMIN_EMAIL)."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.core.config import Settings, settings
from app.models.users import User
from app.schemas.users import UserRead

# Must match ADMIN_ROLE_CODE in app.services.seed_service
ADMIN_ROLE_CODE = "ADMIN"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def is_bootstrap_protected_user(user: User, app_settings: Settings | None = None) -> bool:
    cfg = (app_settings or settings).DEFAULT_ADMIN_EMAIL
    if not cfg or not str(cfg).strip():
        return False
    return normalize_email(str(user.email)) == normalize_email(str(cfg))


def user_read_with_protection_flag(user: User, app_settings: Settings | None = None) -> UserRead:
    base = UserRead.model_validate(user)
    return base.model_copy(
        update={"bootstrap_admin_protected": is_bootstrap_protected_user(user, app_settings)}
    )


def assert_bootstrap_admin_may_not_be_deactivated(user: User, new_status: str | None) -> None:
    if new_status is None:
        return
    if not is_bootstrap_protected_user(user):
        return
    if new_status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="bootstrap_admin_status_must_remain_active",
        )


def assert_bootstrap_admin_admin_role_not_removed(
    user: User,
    role_code: str | None,
) -> None:
    if not role_code:
        return
    if not is_bootstrap_protected_user(user):
        return
    if role_code.upper() == ADMIN_ROLE_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="bootstrap_admin_admin_role_cannot_be_removed",
        )


def assert_bootstrap_admin_may_not_add_roles(user: User) -> None:
    """Bootstrap primary admin keeps a fixed role set; no extra assignments via API."""
    if is_bootstrap_protected_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="bootstrap_admin_cannot_add_roles",
        )


def assert_bootstrap_admin_password_reset_forbidden(user: User) -> None:
    if is_bootstrap_protected_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="bootstrap_admin_password_reset_forbidden",
        )


def assert_bootstrap_admin_permission_overrides_forbidden(user: User) -> None:
    if is_bootstrap_protected_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="bootstrap_admin_permission_overrides_forbidden",
        )
