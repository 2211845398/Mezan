"""User lifecycle: suspended → awaiting_verification → active."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.models.user_onboarding import UserOnboarding
from app.models.users import User
from app.services import auth_service, email_service, user_lifecycle_service
from app.utils.security import hash_password, verify_password


@pytest.mark.security
@pytest.mark.asyncio
async def test_complete_onboarding_sets_awaiting_verification_and_email(
    db_session, monkeypatch
) -> None:
    user = User(
        email=f"hr-{uuid.uuid4().hex[:8]}@example.com",
        first_name="New",
        status="pending_onboarding",
        password_hash=None,
    )
    db_session.add(user)
    await db_session.flush()
    task = UserOnboarding(user_id=user.id, status="pending")
    db_session.add(task)
    await db_session.commit()

    send_mock = AsyncMock()
    monkeypatch.setattr(email_service, "send_email", send_mock)

    await user_lifecycle_service.complete_onboarding_task(
        db_session,
        onboarding_id=task.id,
        actor_user_id=user.id,
        data={
            "contract_start": "2026-01-01",
            "salary_amount": "1500.00",
        },
    )
    await db_session.commit()
    await db_session.refresh(user)

    assert user.status == "awaiting_verification"
    assert user.must_change_password is True
    assert user.password_hash is not None
    send_mock.assert_awaited_once()


@pytest.mark.security
@pytest.mark.asyncio
async def test_change_required_password_activates_user(db_session) -> None:
    temp = "TempPass1234"
    user = User(
        email=f"verify-{uuid.uuid4().hex[:8]}@example.com",
        status="awaiting_verification",
        password_hash=hash_password(temp),
        must_change_password=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    updated = await auth_service.change_required_password(
        db_session,
        user,
        current_password=temp,
        new_password="NewSecure99",
    )
    assert updated.status == "active"
    assert updated.must_change_password is False
    assert verify_password("NewSecure99", updated.password_hash)
