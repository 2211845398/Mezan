"""Shared FastAPI dependencies: current user, permissions (RBAC)."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.config import settings as app_settings
from app.db.database import get_db
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.services.auth_service import ACTIVE_STATUS, AWAITING_VERIFICATION_STATUS, LOGIN_ALLOWED_STATUSES
from app.services.effective_permissions import load_user_effective_permissions
from app.utils.security import decode_token

security = HTTPBearer(auto_error=False)
PERMISSION_DEPENDENCY_MARKER = "__mezan_required_permission__"

_RESTRICTED_SESSION_PATHS: frozenset[tuple[str, str]] = frozenset(
    {
        ("POST", "/api/v1/auth/change-password-required"),
        ("POST", "/api/v1/auth/logout"),
        ("GET", "/api/v1/auth/me"),
        ("PATCH", "/api/v1/auth/me"),
    }
)


def get_settings() -> Settings:
    """Inject the application settings singleton (env-backed)."""
    return app_settings


def _path_requires_full_session(request: Request, user: User) -> bool:
    if user.must_change_password:
        return True
    if user.status == AWAITING_VERIFICATION_STATUS:
        return True
    if user.status != ACTIVE_STATUS:
        return True
    return False


def _is_restricted_session_allowed(request: Request) -> bool:
    return (request.method.upper(), request.url.path) in _RESTRICTED_SESSION_PATHS


async def user_from_access_token(db: AsyncSession, token: str) -> User | None:
    """Resolve an active user from a raw access JWT (SSE query param, etc.)."""
    payload = decode_token(token)
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
    if not user or user.status not in LOGIN_ALLOWED_STATUSES:
        return None
    return user


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> User | None:
    """
    Optional current user from Bearer JWT. Returns None if no/invalid token.
    Use for routes that behave differently when authenticated.
    """
    if not credentials or credentials.credentials is None:
        return None
    user = await user_from_access_token(db, credentials.credentials)
    if user is None:
        return None
    if _path_requires_full_session(request, user) and not _is_restricted_session_allowed(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="password_change_required",
        )
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
    return await load_user_effective_permissions(db, user.id)


_PERMISSIONS_STATE_PREFIX = "_mezan_user_permissions_"


async def get_current_user_permissions_cached(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> set[tuple[str, str]]:
    """Load effective permissions once per HTTP request (request.state memoization)."""
    if _path_requires_full_session(request, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="password_change_required",
        )
    cache_key = f"{_PERMISSIONS_STATE_PREFIX}{user.id}"
    cached = getattr(request.state, cache_key, None)
    if cached is not None:
        return cached
    perms = await load_user_effective_permissions(db, user.id)
    setattr(request.state, cache_key, perms)
    return perms


def require_permission(resource: str, action: str) -> Callable:
    """Dependency factory: require the current user to have (resource, action) permission."""

    async def _check(
        perms: Annotated[set[tuple[str, str]], Depends(get_current_user_permissions_cached)],
    ) -> None:
        if (resource, action) not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {resource}:{action}",
            )

    setattr(_check, PERMISSION_DEPENDENCY_MARKER, (resource, action))
    return Depends(_check)


# Staff self-service (schedule, leave, branch label): any authenticated role with
# routine operational access — includes CASHIER without ``employees:read``.
POS_CATALOG_READ_ANY: tuple[tuple[str, str], ...] = (
    ("catalog", "read"),
    ("pos_shifts", "read"),
    ("pos_carts", "read"),
)


STAFF_SELF_SERVICE_ANY: tuple[tuple[str, str], ...] = (
    ("employees", "read"),
    ("pos_shifts", "read"),
    ("catalog", "read"),
    ("customers", "read"),
    ("accounting", "read"),
    ("users", "read"),
    ("sales_invoices", "read"),
)


def require_any_permission(*pairs: tuple[str, str]) -> Callable:
    """Require at least one of the given (resource, action) permissions."""

    async def _check(
        perms: Annotated[set[tuple[str, str]], Depends(get_current_user_permissions_cached)],
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
