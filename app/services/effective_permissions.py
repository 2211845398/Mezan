"""Effective RBAC permissions per user (roles ∪ global overrides)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user_permission_override import UserPermissionOverride
from app.models.user_role import UserRole
from app.models.users import User


async def load_user_effective_permissions(db: AsyncSession, user_id: int) -> set[tuple[str, str]]:
    """Load effective (resource, action) pairs from roles plus global overrides."""
    role_result = await db.execute(
        select(Permission.resource, Permission.action)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
        .distinct()
    )
    effective = set(role_result.all())

    override_result = await db.execute(
        select(Permission.resource, Permission.action, UserPermissionOverride.effect)
        .join(
            UserPermissionOverride,
            UserPermissionOverride.permission_id == Permission.id,
        )
        .where(UserPermissionOverride.user_id == user_id)
    )
    for resource, action, effect in override_result.all():
        key = (resource, action)
        if effect == "deny":
            effective.discard(key)
        elif effect == "allow":
            effective.add(key)
    return effective


def _permissions_allow_onboarding_assignee(perms: set[tuple[str, str]]) -> bool:
    if ("onboarding", "update") not in perms:
        return False
    return ("employees", "create") in perms or ("employees", "update") in perms


async def user_can_act_as_onboarding_assignee(db: AsyncSession, user_id: int) -> bool:
    """Active user with onboarding:update plus employees create/update (effective perms)."""
    user_res = await db.execute(select(User).where(User.id == user_id))
    user = user_res.scalar_one_or_none()
    if user is None or user.status != "active":
        return False
    perms = await load_user_effective_permissions(db, user_id)
    return _permissions_allow_onboarding_assignee(perms)


async def list_onboarding_assignee_users(db: AsyncSession) -> list[User]:
    """All active users eligible to be assigned as onboarding HR reviewer."""
    result = await db.execute(select(User).where(User.status == "active").order_by(User.id.asc()))
    candidates = list(result.scalars().all())
    out: list[User] = []
    for u in candidates:
        if await user_can_act_as_onboarding_assignee(db, u.id):
            out.append(u)
    return out
