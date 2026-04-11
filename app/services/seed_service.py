"""Seed default permissions, Admin role, and optional default admin user."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user_role import UserRole
from app.models.users import User
from app.utils.security import hash_password

# Default permissions used by routes.
# Important: seeding is idempotent (adds missing permissions if DB already initialized).
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
    # Epic 2: Catalog & Inventory foundations
    ("catalog", "read"),
    ("catalog", "create"),
    ("catalog", "update"),
    ("catalog", "delete"),
    ("purchase_orders", "read"),
    ("purchase_orders", "create"),
    ("purchase_orders", "update"),
    ("inventory", "read"),
    ("inventory", "update"),
    ("invoice_scans", "read"),
    ("invoice_scans", "create"),
    ("invoice_scans", "update"),
    ("invoice_scans", "validate"),
    # Epic 3 POS
    ("pos_shifts", "open"),
    ("pos_shifts", "update"),
    ("pos_shifts", "close"),
    ("pos_carts", "create"),
    ("pos_carts", "update"),
    ("pos_carts", "discount"),
    ("pos_payments", "create"),
    ("pos_payments", "capture"),
    ("sales_invoices", "create"),
    ("returns", "create"),
    ("customers", "create"),
    ("stock_adjustments", "create"),
    ("stock_adjustments", "read"),
    # Epic 4 HR & Payroll
    ("employees", "create"),
    ("employees", "read"),
    ("employees", "update"),
    ("employees", "delete"),
    ("employees", "approve"),
    ("payroll", "create"),
    ("payroll", "read"),
    ("payroll", "approve"),
    ("payroll", "export"),
]

ADMIN_ROLE_NAME = "Admin"


async def seed_permissions_and_roles(db: AsyncSession) -> None:
    """Create missing default permissions and ensure Admin role has them."""
    # Ensure permissions exist
    result = await db.execute(select(Permission))
    existing = {(p.resource, p.action): p for p in result.scalars().all()}
    created_any = False
    for resource, action in DEFAULT_PERMISSIONS:
        if (resource, action) not in existing:
            perm = Permission(resource=resource, action=action)
            db.add(perm)
            created_any = True
    if created_any:
        await db.flush()

    # Ensure Admin role exists
    result = await db.execute(select(Role).where(Role.name == ADMIN_ROLE_NAME))
    admin_role = result.scalar_one_or_none()
    if not admin_role:
        admin_role = Role(name=ADMIN_ROLE_NAME, description="Full system access", is_system=True)
        db.add(admin_role)
        await db.flush()

    # Ensure Admin role has all permissions
    result = await db.execute(select(Permission))
    all_perms = result.scalars().all()
    perm_ids = {p.id for p in all_perms}
    rp_result = await db.execute(
        select(RolePermission.permission_id).where(RolePermission.role_id == admin_role.id)
    )
    assigned = {pid for (pid,) in rp_result.all()}
    for pid in perm_ids - assigned:
        db.add(RolePermission(role_id=admin_role.id, permission_id=pid))

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
