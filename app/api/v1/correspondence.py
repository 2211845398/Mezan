"""Staff correspondence API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import STAFF_SELF_SERVICE_ANY, get_current_user, require_any_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.correspondence import (
    CorrespondenceMessageCreate,
    CorrespondenceMessageRead,
    CorrespondenceThreadCreate,
    CorrespondenceThreadDetail,
    CorrespondenceThreadRead,
    CorrespondenceThreadStatusUpdate,
)
from app.services import audit_service, correspondence_service

router = APIRouter()


def _thread_read(thread) -> CorrespondenceThreadRead:
    return CorrespondenceThreadRead.model_validate(thread)


@router.post(
    "/correspondence/threads",
    response_model=CorrespondenceThreadRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_correspondence_thread(
    body: CorrespondenceThreadCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> CorrespondenceThreadRead:
    thread = await correspondence_service.create_thread(
        db,
        initiator=current_user,
        subject=body.subject,
        request_type=body.request_type,
        target_role_code=body.target_role_code,
        body=body.body,
        target_user_id=body.target_user_id,
    )
    await audit_service.log(
        session=db,
        action="correspondence.thread.created",
        resource_type="correspondence_thread",
        resource_id=str(thread.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return _thread_read(thread)


@router.get("/correspondence/threads/me", response_model=list[CorrespondenceThreadRead])
async def list_my_correspondence_threads(
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> list[CorrespondenceThreadRead]:
    rows = await correspondence_service.list_my_threads(db, user_id=current_user.id, limit=limit)
    return [_thread_read(r) for r in rows]


@router.get("/correspondence/threads/inbox", response_model=list[CorrespondenceThreadRead])
async def list_correspondence_inbox(
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> list[CorrespondenceThreadRead]:
    rows = await correspondence_service.list_manager_inbox(db, user=current_user, limit=limit)
    return [_thread_read(r) for r in rows]


@router.get("/correspondence/threads/{thread_id}", response_model=CorrespondenceThreadDetail)
async def get_correspondence_thread(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> CorrespondenceThreadDetail:
    thread, messages = await correspondence_service.get_thread_with_messages(
        db, thread_id=thread_id, user=current_user
    )
    payload = _thread_read(thread).model_dump()
    payload["messages"] = [CorrespondenceMessageRead.model_validate(m) for m in messages]
    return CorrespondenceThreadDetail.model_validate(payload)


@router.post(
    "/correspondence/threads/{thread_id}/messages",
    response_model=CorrespondenceMessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_correspondence_message(
    thread_id: int,
    body: CorrespondenceMessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> CorrespondenceMessageRead:
    msg = await correspondence_service.add_message(
        db,
        thread_id=thread_id,
        sender=current_user,
        body=body.body,
        is_internal_note=body.is_internal_note,
    )
    await audit_service.log(
        session=db,
        action="correspondence.message.created",
        resource_type="correspondence_message",
        resource_id=str(msg.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return CorrespondenceMessageRead.model_validate(msg)


@router.patch(
    "/correspondence/threads/{thread_id}/status",
    response_model=CorrespondenceThreadRead,
)
async def patch_correspondence_thread_status(
    thread_id: int,
    body: CorrespondenceThreadStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> CorrespondenceThreadRead:
    thread = await correspondence_service.update_thread_status(
        db,
        thread_id=thread_id,
        actor=current_user,
        status=body.status,
    )
    await audit_service.log(
        session=db,
        action="correspondence.thread.status_updated",
        resource_type="correspondence_thread",
        resource_id=str(thread.id),
        new_value={"status": body.status},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return _thread_read(thread)
