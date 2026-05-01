"""Shared FastAPI dependencies: current user, permissions (RBAC)."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, settings as app_settings
from app.db.database import get_db
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user_permission_override import UserPermissionOverride
from app.models.user_role import UserRole
from app.models.users import User
from app.utils.security import decode_token

security = HTTPBearer(auto_error=False)
PERMISSION_DEPENDENCY_MARKER = "__mezan_required_permission__"


def get_settings() -> Settings:
    """Inject the application settings singleton (env-backed)."""
    return app_settings


async def get_current_user_optional(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> User | None:
    """
    Optional current user from Bearer JWT. Returns None if no/invalid token.
    Use for routes that behave differently when authenticated.
    """
    if not credentials or credentials.credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.status != "active":
        return None
    return user


async def get_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    """Require authenticated user; raise 401 if missing or invalid."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_user_permissions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> set[tuple[str, str]]:
    """Load effective permissions from roles plus explicit per-user overrides."""
    role_result = await db.execute(
        select(Permission.resource, Permission.action)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id)
        .distinct()
    )
    effective = set(role_result.all())

    override_result = await db.execute(
        select(Permission.resource, Permission.action, UserPermissionOverride.effect)
        .join(
            UserPermissionOverride,
            UserPermissionOverride.permission_id == Permission.id,
        )
        .where(UserPermissionOverride.user_id == user.id)
    )
    for resource, action, effect in override_result.all():
        key = (resource, action)
        if effect == "deny":
            effective.discard(key)
        elif effect == "allow":
            effective.add(key)
    return effective


def require_permission(resource: str, action: str) -> Callable:
    """Dependency factory: require the current user to have (resource, action) permission."""

    async def _check(
        perms: Annotated[set[tuple[str, str]], Depends(get_current_user_permissions)],
    ) -> None:
        if (resource, action) not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {resource}:{action}",
            )

    setattr(_check, PERMISSION_DEPENDENCY_MARKER, (resource, action))
    return Depends(_check)


def require_any_permission(*pairs: tuple[str, str]) -> Callable:
    """Require at least one of the given (resource, action) permissions."""

    async def _check(
        perms: Annotated[set[tuple[str, str]], Depends(get_current_user_permissions)],
    ) -> None:
        if not any(pair in perms for pair in pairs):
            needed = ", ".join(f"{r}:{a}" for r, a in pairs)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of these permissions required: {needed}",
            )

    setattr(_check, PERMISSION_DEPENDENCY_MARKER, pairs[0])
    return Depends(_check)


async def get_user_role_codes(db: AsyncSession, user_id: int) -> frozenset[str]:
    """Distinct role codes assigned to the user (all branches)."""
    result = await db.execute(
        select(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
        .distinct()
    )
    return frozenset(row[0] for row in result.all())


async def get_current_user_role_codes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> frozenset[str]:
    """Role codes for the authenticated user (for scoped UI / admin gates)."""
    return await get_user_role_codes(db, user.id)


def require_any_role(*allowed_codes: str):
    """Require the user to hold at least one of the given role codes."""

    allowed = frozenset(allowed_codes)

    async def _check(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> None:
        have = await get_user_role_codes(db, user.id)
        if not (have & allowed):
            need = ", ".join(sorted(allowed))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of these roles required: {need}",
            )

    return Depends(_check)
