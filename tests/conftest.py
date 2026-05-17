import os
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.sql.sqltypes import Enum as SQLAlchemyEnum

from alembic import command
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

REPO_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_INI_PATH = REPO_ROOT / "alembic.ini"


def _patch_sqlalchemy_enum_value_compat() -> None:
    # Alembic stores enum values like "asset", while SQLAlchemy may expect enum names.
    if getattr(SQLAlchemyEnum, "_mezan_value_compat_patched", False):
        return

    original = SQLAlchemyEnum._object_value_for_elem

    def _object_value_for_elem(self, elem):
        try:
            return original(self, elem)
        except LookupError:
            enum_class = getattr(self, "enum_class", None)
            if enum_class is not None and isinstance(elem, str):
                try:
                    return enum_class(elem)
                except ValueError:
                    pass
            raise

    SQLAlchemyEnum._object_value_for_elem = _object_value_for_elem
    SQLAlchemyEnum._mezan_value_compat_patched = True


_patch_sqlalchemy_enum_value_compat()


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


@pytest.fixture(scope="session")
def test_db_url() -> str:
    url = _test_db_url()
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to run integration tests")
    return _normalize_async_db_url(url)


@pytest.fixture(scope="session")
def migrated_test_db(test_db_url: str) -> str:
    alembic_config = _alembic_config(test_db_url)
    command.downgrade(alembic_config, "base")
    command.upgrade(alembic_config, "head")
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
        wh = Branch(name="Main Warehouse", code="WH1", address=None, timezone="UTC", is_active=True)
        db_session.add(wh)

    store_result = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = store_result.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)

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
