"""HR feedback submission and listing for employees."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.hr_feedback import HrFeedback, HrFeedbackStatus
from app.models.users import User
from app.services.employee_service import get_employee_profile_id_for_user

_VALID_CATEGORIES = frozenset({"issue", "suggestion", "question"})
MAX_PENDING_SELF_SERVICE_REQUESTS = 2


async def count_pending_hr_feedback(db: AsyncSession, *, user_id: int) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(HrFeedback)
        .where(
            HrFeedback.user_id == user_id,
            HrFeedback.status == HrFeedbackStatus.SUBMITTED.value,
        )
    )
    return int(result.scalar_one())


async def create_hr_feedback(
    db: AsyncSession,
    *,
    user_id: int,
    message: str,
    category: str | None = None,
) -> HrFeedback:
    text = message.strip()
    if len(text) < 3:
        raise ValidationError("message must be at least 3 characters")
    if category is not None and category not in _VALID_CATEGORIES:
        raise ValidationError("Invalid feedback category")

    user = await db.get(User, user_id)
    if user is None:
        raise ValidationError("User not found")

    pending = await count_pending_hr_feedback(db, user_id=user_id)
    if pending >= MAX_PENDING_SELF_SERVICE_REQUESTS:
        raise ValidationError(
            "You already have two HR notes awaiting review. "
            "Please wait until they are reviewed before submitting another."
        )

    employee_profile_id = await get_employee_profile_id_for_user(db, user_id)
    row = HrFeedback(
        user_id=user_id,
        employee_profile_id=employee_profile_id,
        branch_id=user.branch_id,
        category=category,
        message=text,
        status=HrFeedbackStatus.SUBMITTED.value,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def list_my_hr_feedback(
    db: AsyncSession,
    *,
    user_id: int,
    limit: int = 50,
) -> list[HrFeedback]:
    limit = min(max(limit, 1), 100)
    result = await db.execute(
        select(HrFeedback)
        .where(HrFeedback.user_id == user_id)
        .order_by(HrFeedback.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def review_hr_feedback(db: AsyncSession, *, feedback_id: int) -> HrFeedback:
    row = await db.get(HrFeedback, feedback_id)
    if row is None:
        raise NotFoundError("HR feedback not found")
    row.status = HrFeedbackStatus.REVIEWED.value
    await db.flush()
    await db.refresh(row)
    return row
