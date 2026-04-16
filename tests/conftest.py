import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.database import Base
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


def _test_db_url() -> str | None:
    return os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL_TEST")


@pytest.fixture(scope="session")
def test_db_url() -> str:
    url = _test_db_url()
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to run Epic 2 integration tests")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


@pytest.fixture(scope="session")
async def engine(test_db_url: str):
    engine = create_async_engine(test_db_url, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
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

    # Create a branch for inventory tests
    wh = Branch(name="Main Warehouse", code="WH1", address=None, timezone="UTC", is_active=True)
    store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
    db_session.add_all([wh, store])
    await db_session.flush()

    user = User(
        email="admin@example.com",
        full_name="Admin",
        password_hash=hash_password("password123"),
        status="active",
        branch_id=None,
    )
    db_session.add(user)
    await db_session.flush()

    role_result = await db_session.execute(select(Role).where(Role.name == ADMIN_ROLE_NAME))
    role = role_result.scalar_one_or_none()
    if role is None:
        # Fallback (should not happen if seeding works)
        role = Role(name=ADMIN_ROLE_NAME, description="Full system access", is_system=True)
        db_session.add(role)
        await db_session.flush()

    db_session.add(UserRole(user_id=user.id, role_id=role.id, branch_id=None))
    await db_session.commit()

    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}
