"""Seed default permissions, Admin role, and optional default admin user."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting_settings import AccountingSettings
from app.models.chart_accounts import AccountType, ChartAccount
from app.models.currency import Currency
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
    ("suppliers", "read"),
    ("suppliers", "create"),
    ("suppliers", "update"),
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


async def seed_accounting_defaults(db: AsyncSession) -> None:
    """Idempotent: currencies, chart of accounts, and default GL mapping (tests + fresh DB)."""
    res = await db.execute(select(AccountingSettings).where(AccountingSettings.id == 1))
    if res.scalar_one_or_none():
        return

    cur = Currency(code="USD", name="US Dollar", decimal_places=2, suffix=None)
    db.add(cur)
    await db.flush()

    defs: list[tuple[str, str, AccountType, bool, bool]] = [
        ("1000", "Cash on Hand", AccountType.ASSET, False, True),
        ("1100", "Accounts Receivable", AccountType.ASSET, True, True),
        ("1200", "Inventory", AccountType.ASSET, False, True),
        ("2000", "Accounts Payable", AccountType.LIABILITY, True, True),
        ("2100", "Payroll Liability", AccountType.LIABILITY, False, True),
        ("2110", "Payroll Deductions Payable", AccountType.LIABILITY, False, True),
        ("4000", "Sales Revenue", AccountType.REVENUE, False, True),
        ("5000", "Cost of Goods Sold", AccountType.EXPENSE, False, True),
        ("6000", "Salary Expense", AccountType.EXPENSE, False, True),
    ]
    for code, name, at, ctrl, sys in defs:
        db.add(
            ChartAccount(
                code=code,
                name=name,
                account_type=at,
                parent_id=None,
                is_control=ctrl,
                is_system=sys,
                active=True,
            )
        )
    await db.flush()

    codes = (
        "1000",
        "1100",
        "1200",
        "2000",
        "2100",
        "2110",
        "4000",
        "5000",
        "6000",
    )
    acc_res = await db.execute(select(ChartAccount).where(ChartAccount.code.in_(codes)))
    by_code = {a.code: a for a in acc_res.scalars().all()}

    db.add(
        AccountingSettings(
            id=1,
            base_currency_id=cur.id,
            default_cash_account_id=by_code["1000"].id,
            default_ar_account_id=by_code["1100"].id,
            default_ap_account_id=by_code["2000"].id,
            default_inventory_account_id=by_code["1200"].id,
            default_cogs_account_id=by_code["5000"].id,
            default_sales_revenue_account_id=by_code["4000"].id,
            default_salary_expense_account_id=by_code["6000"].id,
            default_payroll_liability_account_id=by_code["2100"].id,
            default_payroll_deductions_payable_account_id=by_code["2110"].id,
        )
    )
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
