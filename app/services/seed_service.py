"""Seed default permissions, Admin role, and optional default admin user."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting_settings import AccountingSettings
from app.models.currency import Currency
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user_role import UserRole
from app.models.users import User
from app.services.attendance_policy_service import seed_default_policies
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
    ("pos_shifts", "read"),
    ("pos_shifts", "update"),
    ("pos_shifts", "close"),
    ("pos_carts", "create"),
    ("pos_carts", "read"),
    ("pos_carts", "update"),
    ("pos_carts", "discount"),
    ("pos_payments", "create"),
    ("pos_payments", "capture"),
    ("sales_invoices", "create"),
    ("sales_invoices", "read"),
    ("sales_invoices", "void"),
    ("returns", "create"),
    ("customers", "create"),
    ("customers", "read"),
    ("customers", "update"),
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
    # Epic 6: CRM & Marketing
    ("loyalty", "create"),
    ("loyalty", "read"),
    ("loyalty", "update"),
    ("loyalty", "adjust"),
    ("discounts", "create"),
    ("discounts", "read"),
    ("discounts", "update"),
    ("discounts", "delete"),
    ("analytics", "read"),
    # Epic 5 Accounting
    ("accounting", "read"),
    ("accounting", "create"),
    ("accounting", "update"),
    ("suppliers", "read"),
    ("suppliers", "create"),
    ("suppliers", "update"),
    # Epic 7/10/11
    ("onboarding", "read"),
    ("onboarding", "update"),
    ("marketing_advisory", "run"),
    ("backups", "read"),
    ("backups", "run"),
    ("notifications", "read"),
    ("notifications", "update"),
    # Epic 14: AI advisory expansion
    ("ai_advisory", "run"),
]

ADMIN_ROLE_NAME = "Admin"
ADMIN_ROLE_CODE = "ADMIN"

SYSTEM_ROLE_SPECS = [
    {
        "code": "OWNER",
        "name": "Owner",
        "description": "Executive full-access role",
        "selectors": [("*", "*")],
    },
    {
        "code": "IT_ADMIN",
        "name": "IT Admin",
        "description": "Identity, access, and system administration",
        "selectors": [
            ("users", "*"),
            ("roles", "*"),
            ("audit_log", "read"),
            ("config", "*"),
            ("notifications", "read"),
            ("notifications", "update"),
            ("branches", "*"),
            ("terminals", "*"),
            ("onboarding", "read"),
            ("backups", "*"),
        ],
    },
    {
        "code": "HR_MANAGER",
        "name": "HR Manager",
        "description": "Staff onboarding and payroll approvals",
        "selectors": [
            ("employees", "*"),
            ("payroll", "*"),
            ("onboarding", "*"),
            ("notifications", "read"),
            ("notifications", "update"),
        ],
    },
    {
        "code": "ACCOUNTANT",
        "name": "Accountant",
        "description": "General ledger, periods, and supplier accounting",
        "selectors": [
            ("accounting", "*"),
            ("suppliers", "*"),
            ("sales_invoices", "void"),
            ("notifications", "read"),
        ],
    },
    {
        "code": "CASHIER",
        "name": "Cashier",
        "description": "Point-of-sale execution role",
        "selectors": [
            ("terminals", "read"),
            ("pos_shifts", "*"),
            ("pos_carts", "*"),
            ("pos_payments", "*"),
            ("sales_invoices", "create"),
            ("sales_invoices", "read"),
            ("returns", "create"),
            ("customers", "create"),
            ("customers", "read"),
            ("notifications", "read"),
        ],
    },
    {
        "code": "WAREHOUSE_MANAGER",
        "name": "Warehouse Manager",
        "description": "Inventory, purchase, and goods receiving operations",
        "selectors": [
            ("catalog", "*"),
            ("purchase_orders", "*"),
            ("inventory", "*"),
            ("invoice_scans", "*"),
            ("stock_adjustments", "*"),
            ("ai_advisory", "run"),
            ("notifications", "read"),
        ],
    },
    {
        "code": "MARKETING_MANAGER",
        "name": "Marketing Manager",
        "description": "Discount and advisory operations",
        "selectors": [
            ("discounts", "*"),
            ("analytics", "read"),
            ("loyalty", "read"),
            ("loyalty", "update"),
            ("loyalty", "adjust"),
            ("customers", "read"),
            ("customers", "update"),
            ("marketing_advisory", "run"),
            ("ai_advisory", "run"),
            ("invoice_scans", "read"),
            ("invoice_scans", "validate"),
            ("notifications", "read"),
        ],
    },
    {
        "code": "FLOOR_STAFF",
        "name": "Floor Staff",
        "description": "Read-only floor operations role",
        "selectors": [
            ("catalog", "read"),
            ("inventory", "read"),
            ("customers", "create"),
            ("notifications", "read"),
        ],
    },
]


def _permission_ids_for_selectors(
    permissions: list[Permission], selectors: list[tuple[str, str]]
) -> set[int]:
    ids: set[int] = set()
    for perm in permissions:
        for resource, action in selectors:
            if (resource == "*" or perm.resource == resource) and (
                action == "*" or perm.action == action
            ):
                ids.add(perm.id)
                break
    return ids


async def _ensure_role_permissions(
    db: AsyncSession, *, role: Role, target_permission_ids: set[int]
) -> None:
    result = await db.execute(
        select(RolePermission.permission_id).where(RolePermission.role_id == role.id)
    )
    assigned = {pid for (pid,) in result.all()}
    for pid in target_permission_ids - assigned:
        db.add(RolePermission(role_id=role.id, permission_id=pid))


async def seed_permissions_and_roles(db: AsyncSession) -> None:
    """Create missing permissions and ensure fixed system roles exist."""
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
        admin_role = Role(
            code=ADMIN_ROLE_CODE,
            name=ADMIN_ROLE_NAME,
            description="Full system access",
            is_system=True,
        )
        db.add(admin_role)
        await db.flush()
    elif admin_role.code != ADMIN_ROLE_CODE:
        admin_role.code = ADMIN_ROLE_CODE

    # Ensure Admin role has all permissions
    result = await db.execute(select(Permission))
    all_perms = result.scalars().all()
    perm_ids = {p.id for p in all_perms}
    await _ensure_role_permissions(db, role=admin_role, target_permission_ids=perm_ids)

    # Ensure immutable base roles are present and permissioned.
    for spec in SYSTEM_ROLE_SPECS:
        role_res = await db.execute(select(Role).where(Role.code == spec["code"]))
        role = role_res.scalar_one_or_none()
        if not role:
            role = Role(
                code=spec["code"],
                name=spec["name"],
                description=spec["description"],
                is_system=True,
            )
            db.add(role)
            await db.flush()
        else:
            role.name = spec["name"]
            role.description = spec["description"]
            role.is_system = True
        target_permission_ids = _permission_ids_for_selectors(
            all_perms, selectors=spec["selectors"]
        )
        await _ensure_role_permissions(db, role=role, target_permission_ids=target_permission_ids)

    await seed_default_policies(db)
    await db.commit()


async def seed_accounting_defaults(db: AsyncSession) -> None:
    """Idempotent: currencies, hierarchical CoA, and default GL mapping."""
    from app.services.coa_seed_service import (
        build_accounting_settings,
        plant_coa_tree,
        upgrade_coa_skeleton,
    )

    res = await db.execute(select(AccountingSettings).where(AccountingSettings.id == 1))
    if res.scalar_one_or_none():
        await upgrade_coa_skeleton(db)
        await db.commit()
        return

    cur = Currency(
        code="USD",
        name="US Dollar",
        decimal_places=2,
        suffix=None,
        exchange_rate_to_base=Decimal("1"),
    )
    db.add(cur)
    await db.flush()

    by_code = await plant_coa_tree(db)
    db.add(await build_accounting_settings(db, currency_id=cur.id, by_code=by_code))
    await db.flush()
    from app.services.branch_accounting_service import provision_all_branches

    await provision_all_branches(db)
    await db.commit()


DEFAULT_NOTIFICATION_TEMPLATES: list[dict] = [
    {
        "kind": "low_stock",
        "title_template": "Low stock: {product_name}",
        "body_template": (
            "Product {product_name} (branch {branch_id}) on-hand is {on_hand} "
            "(threshold {threshold})."
        ),
        "default_data": {"category": "inventory"},
    },
    {
        "kind": "expiring_inventory",
        "title_template": "Expiring soon: {product_name}",
        "body_template": (
            "Product {product_name} in branch {branch_id} has {on_hand} units expiring "
            "on {expiry_date} ({days_left} days left)."
        ),
        "default_data": {"category": "inventory"},
    },
    {
        "kind": "payroll_approval_pending",
        "title_template": "Payroll waiting for approval",
        "body_template": "{pending_count} draft payslips are pending approval as of {as_of}.",
        "default_data": {"category": "hr"},
    },
    {
        "kind": "shift_close_reminder",
        "title_template": "Please close your shift",
        "body_template": (
            "Shift {shift_id} in branch {branch_id} has been open since {opened_at}. "
            "Open shifts beyond {max_hours}h should be closed."
        ),
        "default_data": {"category": "pos"},
    },
    {
        "kind": "backup_failure",
        "title_template": "Database backup failed",
        "body_template": "Last backup ({started_at}) failed: {error_message}",
        "default_data": {"category": "ops"},
    },
]


async def seed_notification_templates(db: AsyncSession) -> None:
    """Idempotent seed for notification templates used by built-in generators."""
    from app.models.notifications import NotificationTemplate

    for spec in DEFAULT_NOTIFICATION_TEMPLATES:
        res = await db.execute(
            select(NotificationTemplate).where(NotificationTemplate.kind == spec["kind"])
        )
        existing = res.scalar_one_or_none()
        if existing is not None:
            continue
        db.add(
            NotificationTemplate(
                kind=spec["kind"],
                title_template=spec["title_template"],
                body_template=spec["body_template"],
                default_data=spec.get("default_data", {}),
                is_active=True,
            )
        )
    await db.commit()


async def seed_default_admin(db: AsyncSession, email: str, password: str) -> None:
    """Create default admin user and assign Admin role if no users exist."""
    result = await db.execute(select(User).limit(1))
    if result.scalar_one_or_none() is not None:
        return
    result = await db.execute(select(Role).where(Role.code == ADMIN_ROLE_CODE))
    admin_role = result.scalar_one_or_none()
    if not admin_role:
        return
    user = User(
        email=email,
        first_name="System Administrator",
        father_name=None,
        family_name=None,
        password_hash=hash_password(password),
        status="active",
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, role_id=admin_role.id, branch_id=None))
    await db.commit()
