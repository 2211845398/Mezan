"""Employee HR feedback (mobile self-service)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    STAFF_SELF_SERVICE_ANY,
    get_current_user,
    require_any_permission,
    require_permission,
)
from app.db.database import get_db
from app.models.users import User
from app.schemas.hr import HrFeedbackCreate, HrFeedbackRead
from app.services import audit_service
from app.services.hr_feedback_service import (
    create_hr_feedback,
    list_my_hr_feedback,
    review_hr_feedback,
)

router = APIRouter()


@router.post(
    "/hr/feedback",
    response_model=HrFeedbackRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_hr_feedback_endpoint(
    body: HrFeedbackCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> HrFeedbackRead:
    row = await create_hr_feedback(
        db,
        user_id=current_user.id,
        message=body.message,
        category=body.category,
    )
    await audit_service.log(
        session=db,
        action="hr_feedback.submitted",
        resource_type="hr_feedback",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return HrFeedbackRead.model_validate(row)


@router.get("/hr/feedback/me", response_model=list[HrFeedbackRead])
async def list_my_hr_feedback_endpoint(
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> list[HrFeedbackRead]:
    rows = await list_my_hr_feedback(db, user_id=current_user.id, limit=limit)
    return [HrFeedbackRead.model_validate(r) for r in rows]


@router.patch(
    "/hr/feedback/{feedback_id}/review",
    response_model=HrFeedbackRead,
)
async def review_hr_feedback_endpoint(
    feedback_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "approve"),
) -> HrFeedbackRead:
    """Mark employee HR feedback as reviewed (unblocks further submissions)."""
    row = await review_hr_feedback(db, feedback_id=feedback_id)
    await audit_service.log(
        session=db,
        action="hr_feedback.reviewed",
        resource_type="hr_feedback",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return HrFeedbackRead.model_validate(row)
