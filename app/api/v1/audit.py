"""Audit log API (read-only, RBAC-protected)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogListResponse, AuditLogRead

router = APIRouter()


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: int | None = Query(None),
    branch_id: int | None = Query(None),
    resource_type: str | None = Query(None),
    _: None = Depends(get_current_user),
    __: None = require_permission("audit_log", "read"),
) -> AuditLogListResponse:
    """List audit log entries with optional filters. Requires audit_log:read."""
    q = select(AuditLog)
    count_q = select(func.count()).select_from(AuditLog)
    if user_id is not None:
        q = q.where(AuditLog.user_id == user_id)
        count_q = count_q.where(AuditLog.user_id == user_id)
    if branch_id is not None:
        q = q.where(AuditLog.branch_id == branch_id)
        count_q = count_q.where(AuditLog.branch_id == branch_id)
    if resource_type is not None:
        q = q.where(AuditLog.resource_type == resource_type)
        count_q = count_q.where(AuditLog.resource_type == resource_type)

    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0
    q = q.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = result.scalars().all()
    pages = max(1, (total + page_size - 1) // page_size)

    return AuditLogListResponse(
        items=[AuditLogRead.model_validate(e) for e in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )
