"""Seed default permissions, Admin role, and optional default admin user."""

from decimal import Decimal

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
    ("sales_invoices", "void"),
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
        ],
    },
    {
        "code": "CASHIER",
        "name": "Cashier",
        "description": "Point-of-sale execution role",
        "selectors": [
            ("pos_shifts", "*"),
            ("pos_carts", "*"),
            ("pos_payments", "*"),
            ("sales_invoices", "create"),
            ("returns", "create"),
            ("customers", "create"),
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
            ("marketing_advisory", "run"),
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
        ("1010", "Card Clearing", AccountType.ASSET, False, True),
        ("1015", "Other Payments Clearing", AccountType.ASSET, False, True),
        ("1100", "Accounts Receivable", AccountType.ASSET, True, True),
        ("1200", "Inventory", AccountType.ASSET, False, True),
        ("2000", "Accounts Payable", AccountType.LIABILITY, True, True),
        ("2100", "Payroll Liability", AccountType.LIABILITY, False, True),
        ("2110", "Payroll Deductions Payable", AccountType.LIABILITY, False, True),
        ("2200", "Output VAT Payable", AccountType.LIABILITY, False, True),
        ("4000", "Sales Revenue", AccountType.REVENUE, False, True),
        ("4090", "Sales Discounts", AccountType.EXPENSE, False, True),
        ("5000", "Cost of Goods Sold", AccountType.EXPENSE, False, True),
        ("6000", "Salary Expense", AccountType.EXPENSE, False, True),
        ("1020", "Cash Over and Short", AccountType.EXPENSE, False, True),
        ("2120", "Loyalty Points Liability", AccountType.LIABILITY, False, True),
        ("6100", "Loyalty Program Expense", AccountType.EXPENSE, False, True),
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
        "1010",
        "1015",
        "1100",
        "1200",
        "2000",
        "2100",
        "2110",
        "2200",
        "4000",
        "4090",
        "5000",
        "6000",
        "1020",
        "2120",
        "6100",
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
            default_card_clearing_account_id=by_code["1010"].id,
            default_other_clearing_account_id=by_code["1015"].id,
            default_sales_discount_account_id=by_code["4090"].id,
            default_salary_expense_account_id=by_code["6000"].id,
            default_payroll_liability_account_id=by_code["2100"].id,
            default_payroll_deductions_payable_account_id=by_code["2110"].id,
            default_output_tax_payable_account_id=by_code["2200"].id,
            default_cash_over_short_account_id=by_code["1020"].id,
            default_loyalty_liability_account_id=by_code["2120"].id,
            default_loyalty_expense_account_id=by_code["6100"].id,
            default_loyalty_point_value=Decimal("0.01"),
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
        full_name="System Administrator",
        password_hash=hash_password(password),
        status="active",
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, role_id=admin_role.id, branch_id=None))
    await db.commit()
