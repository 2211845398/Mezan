"""Seed default permissions, Admin role, and optional default admin user."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user_role import UserRole
from app.models.users import User
from app.utils.security import hash_password


# All permissions used by Epic 1 routes
DEFAULT_PERMISSIONS = [
    ("users", "create"),
    ("users", "read"),
    ("users", "update"),
    ("users", "delete"),
    ("audit_log", "read"),
    ("config", "read"),
    ("config", "update"),
    ("branches", "read"),
    ("branches", "create"),
    ("branches", "update"),
    ("branches", "delete"),
    ("terminals", "read"),
    ("terminals", "create"),
    ("terminals", "update"),
    ("terminals", "authorize"),
    ("roles", "read"),
    ("roles", "create"),
    ("roles", "update"),
]

ADMIN_ROLE_NAME = "Admin"


async def seed_permissions_and_roles(db: AsyncSession) -> None:
    """Create default permissions and Admin role if they do not exist."""
    result = await db.execute(select(Permission).limit(1))
    if result.scalar_one_or_none() is not None:
        return  # already seeded

    # Create permissions
    for resource, action in DEFAULT_PERMISSIONS:
        db.add(Permission(resource=resource, action=action))
    await db.flush()

    # Create Admin role
    result = await db.execute(select(Permission))
    all_perms = result.scalars().all()
    admin_role = Role(name=ADMIN_ROLE_NAME, description="Full system access", is_system=True)
    db.add(admin_role)
    await db.flush()
    for p in all_perms:
        db.add(RolePermission(role_id=admin_role.id, permission_id=p.id))
    await db.commit()


async def seed_default_admin(db: AsyncSession, email: str, password: str) -> None:
    """Create default admin user and assign Admin role if no users exist."""
    result = await db.execute(select(User).limit(1))
    if result.scalar_one_or_none() is not None:
        return
    result = await db.execute(select(Role).where(Role.name == ADMIN_ROLE_NAME))
    admin_role = result.scalar_one_or_none()
    if not admin_role:
        return
    user = User(
        email=email,
        full_name="System Administrator",
        password_hash=hash_password(password),
        status="active",
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, role_id=admin_role.id, branch_id=None))
    await db.commit()
