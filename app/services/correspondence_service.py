"""Staff correspondence threads between employees and managers."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.correspondence import (
    CorrespondenceMessage,
    CorrespondenceThread,
    CorrespondenceThreadStatus,
)
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User

MANAGER_ROLE_CODES = frozenset(
    {
        "OWNER",
        "ADMIN",
        "HR_MANAGER",
        "IT_ADMIN",
        "MARKETING_MANAGER",
        "ACCOUNTANT",
        "WAREHOUSE_MANAGER",
    }
)

REQUEST_TYPE_TO_ROLE = {
    "administrative": "OWNER",
    "hr": "HR_MANAGER",
    "it": "IT_ADMIN",
    "finance": "ACCOUNTANT",
    "general": "HR_MANAGER",
}


async def _user_role_codes(db: AsyncSession, user_id: int) -> frozenset[str]:
    result = await db.execute(
        select(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
        .distinct()
    )
    return frozenset(row[0] for row in result.all())


async def _can_access_thread(db: AsyncSession, user: User, thread: CorrespondenceThread) -> bool:
    if thread.initiator_user_id == user.id or thread.target_user_id == user.id:
        return True
    roles = await _user_role_codes(db, user.id)
    if thread.target_role_code in roles:
        return True
    return bool(roles & {"OWNER", "ADMIN"})


async def create_thread(
    db: AsyncSession,
    *,
    initiator: User,
    subject: str,
    request_type: str,
    target_role_code: str | None,
    body: str,
    target_user_id: int | None = None,
) -> CorrespondenceThread:
    subject_clean = subject.strip()
    body_clean = body.strip()
    if len(subject_clean) < 2:
        raise ValidationError("subject is required", details={"code": "subject_required"})
    if len(body_clean) < 3:
        raise ValidationError("message is required", details={"code": "message_required"})

    role_code = (target_role_code or REQUEST_TYPE_TO_ROLE.get(request_type, "HR_MANAGER")).upper()
    if role_code not in MANAGER_ROLE_CODES:
        raise ValidationError("Invalid target role", details={"target_role_code": role_code})

    thread = CorrespondenceThread(
        subject=subject_clean,
        request_type=request_type,
        initiator_user_id=initiator.id,
        target_role_code=role_code,
        target_user_id=target_user_id,
        branch_id=initiator.branch_id,
        status=CorrespondenceThreadStatus.OPEN.value,
    )
    db.add(thread)
    await db.flush()

    msg = CorrespondenceMessage(
        thread_id=thread.id,
        sender_user_id=initiator.id,
        body=body_clean,
        is_internal_note=False,
    )
    db.add(msg)
    thread.updated_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(thread)
    return thread


async def list_my_threads(
    db: AsyncSession,
    *,
    user_id: int,
    limit: int = 50,
) -> list[CorrespondenceThread]:
    result = await db.execute(
        select(CorrespondenceThread)
        .where(CorrespondenceThread.initiator_user_id == user_id)
        .order_by(CorrespondenceThread.updated_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_manager_inbox(
    db: AsyncSession,
    *,
    user: User,
    limit: int = 50,
) -> list[CorrespondenceThread]:
    roles = await _user_role_codes(db, user.id)
    if not roles:
        return []

    filters = [CorrespondenceThread.target_user_id == user.id]
    manager_roles = roles & MANAGER_ROLE_CODES
    if manager_roles:
        filters.append(CorrespondenceThread.target_role_code.in_(list(manager_roles)))
    if "OWNER" in roles or "ADMIN" in roles:
        filters.append(CorrespondenceThread.target_role_code.isnot(None))

    result = await db.execute(
        select(CorrespondenceThread)
        .where(or_(*filters))
        .order_by(CorrespondenceThread.updated_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_thread_with_messages(
    db: AsyncSession,
    *,
    thread_id: int,
    user: User,
) -> tuple[CorrespondenceThread, list[CorrespondenceMessage]]:
    result = await db.execute(
        select(CorrespondenceThread).where(CorrespondenceThread.id == thread_id)
    )
    thread = result.scalar_one_or_none()
    if thread is None:
        raise NotFoundError("Thread not found", details={"thread_id": thread_id})
    if not await _can_access_thread(db, user, thread):
        raise ValidationError("Access denied", details={"code": "forbidden"})

    roles = await _user_role_codes(db, user.id)
    is_manager = bool(roles & MANAGER_ROLE_CODES) or thread.initiator_user_id != user.id

    msg_query = select(CorrespondenceMessage).where(CorrespondenceMessage.thread_id == thread_id)
    if not is_manager:
        msg_query = msg_query.where(CorrespondenceMessage.is_internal_note.is_(False))
    msg_query = msg_query.order_by(CorrespondenceMessage.created_at.asc())
    messages = list((await db.execute(msg_query)).scalars().all())
    return thread, messages


async def add_message(
    db: AsyncSession,
    *,
    thread_id: int,
    sender: User,
    body: str,
    is_internal_note: bool = False,
) -> CorrespondenceMessage:
    body_clean = body.strip()
    if len(body_clean) < 1:
        raise ValidationError("message is required", details={"code": "message_required"})

    result = await db.execute(
        select(CorrespondenceThread).where(CorrespondenceThread.id == thread_id)
    )
    thread = result.scalar_one_or_none()
    if thread is None:
        raise NotFoundError("Thread not found", details={"thread_id": thread_id})
    if thread.status == CorrespondenceThreadStatus.CLOSED.value:
        raise ValidationError("Thread is closed", details={"code": "thread_closed"})
    if not await _can_access_thread(db, sender, thread):
        raise ValidationError("Access denied", details={"code": "forbidden"})

    roles = await _user_role_codes(db, sender.id)
    if is_internal_note and not (roles & MANAGER_ROLE_CODES or roles & {"OWNER", "ADMIN"}):
        raise ValidationError("Internal notes require manager role", details={"code": "forbidden"})

    msg = CorrespondenceMessage(
        thread_id=thread_id,
        sender_user_id=sender.id,
        body=body_clean,
        is_internal_note=is_internal_note,
    )
    db.add(msg)
    thread.updated_at = datetime.now(UTC)
    if sender.id != thread.initiator_user_id and thread.status == CorrespondenceThreadStatus.OPEN.value:
        thread.status = CorrespondenceThreadStatus.ANSWERED.value
    await db.flush()
    await db.refresh(msg)
    return msg


async def update_thread_status(
    db: AsyncSession,
    *,
    thread_id: int,
    actor: User,
    status: str,
) -> CorrespondenceThread:
    if status not in {s.value for s in CorrespondenceThreadStatus}:
        raise ValidationError("Invalid status", details={"status": status})

    result = await db.execute(
        select(CorrespondenceThread).where(CorrespondenceThread.id == thread_id)
    )
    thread = result.scalar_one_or_none()
    if thread is None:
        raise NotFoundError("Thread not found", details={"thread_id": thread_id})

    roles = await _user_role_codes(db, actor.id)
    if not (roles & MANAGER_ROLE_CODES or roles & {"OWNER", "ADMIN"}):
        if thread.initiator_user_id != actor.id:
            raise ValidationError("Access denied", details={"code": "forbidden"})

    thread.status = status
    thread.updated_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(thread)
    return thread
