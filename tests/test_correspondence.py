"""Staff correspondence threads."""

from __future__ import annotations

import uuid

import pytest

from app.models.users import User
from app.services import correspondence_service
from app.utils.security import hash_password


async def _user(db_session, *, email: str | None = None) -> User:
    u = User(
        email=email or f"corr-{uuid.uuid4().hex[:8]}@example.com",
        status="active",
        password_hash=hash_password("password123"),
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.mark.security
@pytest.mark.asyncio
async def test_employee_creates_thread_and_lists(db_session) -> None:
    employee = await _user(db_session)
    thread = await correspondence_service.create_thread(
        db_session,
        initiator=employee,
        subject="Need IT support",
        request_type="it",
        target_role_code="IT_ADMIN",
        body="Laptop issue",
    )
    await db_session.commit()
    assert thread.id > 0

    rows = await correspondence_service.list_my_threads(db_session, user_id=employee.id)
    assert any(r.id == thread.id for r in rows)
