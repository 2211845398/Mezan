import asyncio
import os
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from app.db.enum_compat import patch_sqlalchemy_enum_value_compat
from app.main import app
from app.models.branch import Branch
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.services.seed_service import (
    ADMIN_ROLE_NAME,
    seed_accounting_defaults,
    seed_permissions_and_roles,
)
from app.utils.security import create_access_token, hash_password

patch_sqlalchemy_enum_value_compat()

REPO_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_INI_PATH = REPO_ROOT / "alembic.ini"


def _test_db_url() -> str | None:
    return os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL_TEST")


def _normalize_async_db_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _alembic_config(database_url: str) -> Config:
    config = Config(str(ALEMBIC_INI_PATH))
    config.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


async def _reset_test_database_schema(database_url: str) -> None:
    """Drop and recreate ``public`` instead of Alembic downgrade (broken on old revisions)."""
    engine = create_async_engine(database_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
    finally:
        await engine.dispose()


def _prepare_test_database(database_url: str) -> None:
    asyncio.run(_reset_test_database_schema(database_url))
    command.upgrade(_alembic_config(database_url), "head")


@pytest.fixture(scope="session")
def test_db_url() -> str:
    url = _test_db_url()
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to run integration tests")
    return _normalize_async_db_url(url)


@pytest.fixture(scope="session")
def migrated_test_db(test_db_url: str) -> str:
    _prepare_test_database(test_db_url)
    return test_db_url


@pytest.fixture(scope="session")
async def engine(migrated_test_db: str):
    # Keep the shared async engine on the session loop configured in pytest.
    engine = create_async_engine(migrated_test_db, future=True, pool_pre_ping=True)
    yield engine
    await engine.dispose()


@pytest.fixture()
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session


@pytest.fixture()
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    # Override app DB dependency for tests
    async def _override_get_db():
        yield db_session

    from app.db.database import get_db

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
async def admin_auth_header(db_session: AsyncSession) -> dict[str, str]:
    # Ensure permissions + Admin role exist
    await seed_permissions_and_roles(db_session)
    await seed_accounting_defaults(db_session)

    # Reuse seeded records when tests share one disposable database across the suite.
    warehouse_result = await db_session.execute(select(Branch).where(Branch.code == "WH1"))
    wh = warehouse_result.scalar_one_or_none()
    if wh is None:
        wh = Branch(
            name="Main Warehouse",
            code="WH1",
            address=None,
            timezone="UTC",
            is_active=True,
            kind="warehouse",
        )
        db_session.add(wh)
    else:
        wh.kind = "warehouse"

    store_result = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = store_result.scalar_one_or_none()
    if store is None:
        store = Branch(
            name="Store A",
            code="ST1",
            address=None,
            timezone="UTC",
            is_active=True,
            kind="commercial",
        )
        db_session.add(store)
    else:
        store.kind = "commercial"

    user_result = await db_session.execute(select(User).where(User.email == "admin@example.com"))
    user = user_result.scalar_one_or_none()
    if user is None:
        user = User(
            email="admin@example.com",
            first_name="Admin",
            father_name=None,
            family_name=None,
            password_hash=hash_password("password123"),
            status="active",
            branch_id=None,
        )
        db_session.add(user)
    else:
        user.first_name = "Admin"
        user.father_name = None
        user.family_name = None
        user.password_hash = hash_password("password123")
        user.status = "active"
        user.branch_id = None

    role_result = await db_session.execute(select(Role).where(Role.name == ADMIN_ROLE_NAME))
    role = role_result.scalar_one_or_none()
    if role is None:
        # Fallback (should not happen if seeding works)
        role = Role(name=ADMIN_ROLE_NAME, description="Full system access", is_system=True)
        db_session.add(role)
    await db_session.flush()

    user_role_result = await db_session.execute(
        select(UserRole).where(
            UserRole.user_id == user.id,
            UserRole.role_id == role.id,
            UserRole.branch_id.is_(None),
        )
    )
    if user_role_result.scalar_one_or_none() is None:
        db_session.add(UserRole(user_id=user.id, role_id=role.id, branch_id=None))
    await db_session.commit()

    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
async def commercial_branch_id(db_session: AsyncSession) -> int:
    res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    return int(res.scalar_one().id)


@pytest.fixture()
async def warehouse_branch_id(db_session: AsyncSession) -> int:
    res = await db_session.execute(select(Branch).where(Branch.code == "WH1"))
    return int(res.scalar_one().id)


# ---------------------------------------------------------------------------
# Test suite policy: default CI runs ``-m "core or security"`` (see pyproject.toml).
# ---------------------------------------------------------------------------

_SKIP_LEGACY = frozenset(
    {
        "test_attendance_log_payroll_impact",
        "test_payroll_overview",
        "test_po_receive_variant",
    }
)

_SKIP_VOLATILE = frozenset(
    {
        "test_payroll_srs",
        "test_payroll_period",
        "test_attendance_logs_pagination",
        "test_attendance_policy_snapshot",
        "test_hr_anomaly_service",
        "test_employees_me_schedules_api",
        "test_employees_me_leave_requests_api",
        "test_employees_list_search",
        "test_pos_e2e_flow",
        "test_pos_checkout_contract",
        "test_happy_user_journey",
        "test_variant_attribute_pivot",
        "test_variant_purchasing_search",
        "test_variant_reference_and_barcode",
        "test_variant_display",
        "test_variant_combinator",
        "test_product_template_axes",
        "test_product_unit_conversions",
        "test_product_barcode_deprecated",
        "test_catalog_category_tree",
        "test_catalog_product_categories",
        "test_catalog_tax_definitions",
        "test_catalog_default_variant",
        "test_smart_sku",
        "test_sequential_attribute_code",
        "test_po_line_uom",
        "test_inventory_reporting_open_po",
        "test_inventory_operations",
        "test_transfer_in_transit",
        "test_transfer_variant",
        "test_stock_count_sessions",
        "test_purchase_order_send_email",
        "test_epic2",
        "test_api_pagination",
        "test_notifications",
        "test_notification_schedule_owner",
        "test_users_onboarding_assignee_api",
        "test_profile_me",
        "test_currencies_payment_terms",
        "test_chart_account_suggest_code",
        "test_chart_account_tree_sort",
        "test_chart_account_i18n",
        "test_branch_archival",
        "test_units_of_measure",
        "test_libyan_validators",
    }
)

_CORE_MODULES = frozenset(
    {
        "test_finalize_atomicity",
        "test_output_vat_gl",
        "test_gl_milestone2",
        "test_milestone5_operational_gl",
        "test_journal_subledger",
        "test_journal_update",
        "test_journal_source_reference",
        "test_transfer_branch_gl",
        "test_sales_invoice_void",
        "test_branch_cash_accounts",
        "test_supplier_statement",
        "test_coa_seed_structure",
        "test_core_seed",
        "test_enum_compat",
        "test_main",
    }
)

_SECURITY_MODULES = frozenset(
    {
        "test_security_hardening",
        "test_bootstrap_admin_protection",
        "test_auth_permissions_endpoint",
        "test_password_reset_flow",
        "test_date_filter_hardening",
        "test_branch_kind_rules",
    }
)


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        stem = item.path.stem
        if stem in _SKIP_LEGACY:
            item.add_marker(pytest.mark.skip(reason="Legacy workflow, pending redesign"))
            continue
        if stem in _SKIP_VOLATILE:
            item.add_marker(
                pytest.mark.skip(
                    reason="Volatile workflow excluded from default CI; pending redesign"
                )
            )
            continue
        if stem in _CORE_MODULES:
            item.add_marker(pytest.mark.core)
        elif stem in _SECURITY_MODULES:
            item.add_marker(pytest.mark.security)
