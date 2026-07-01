"""Audit log API (read-only, RBAC-protected)."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.audit_log import AuditLog
from app.models.users import User
from app.schemas.audit import AuditLogListResponse, AuditLogRead
from app.utils.person_name import display_person_name

router = APIRouter()


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: int | None = Query(None, description="Filter by user ID"),
    branch_id: int | None = Query(None, description="Filter by branch ID"),
    resource_type: str | None = Query(None, description="Filter by resource type"),
    action: str | None = Query(None, description="Filter by action (partial match)"),
    resource_id: str | None = Query(None, description="Filter by resource ID (partial match)"),
    date_from: datetime | None = Query(None, description="Filter from date (ISO 8601)"),
    date_to: datetime | None = Query(None, description="Filter to date (ISO 8601)"),
    q: str | None = Query(None, description="Search action/resource_type/resource_id"),
    _: None = Depends(get_current_user),
    __: None = require_permission("audit_log", "read"),
) -> AuditLogListResponse:
    """List audit log entries with optional filters. Requires audit_log:read.

    Enriches results with user names and branch names via joins.
    """
    # Build base query with joins for enrichment
    q_base = select(AuditLog).options(
        joinedload(AuditLog.user).joinedload(User.branch),
        joinedload(AuditLog.branch),
    )
    count_q = select(func.count()).select_from(AuditLog)

    # Apply filters
    if user_id is not None:
        q_base = q_base.where(AuditLog.user_id == user_id)
        count_q = count_q.where(AuditLog.user_id == user_id)
    if branch_id is not None:
        q_base = q_base.where(AuditLog.branch_id == branch_id)
        count_q = count_q.where(AuditLog.branch_id == branch_id)
    if resource_type is not None:
        q_base = q_base.where(AuditLog.resource_type == resource_type)
        count_q = count_q.where(AuditLog.resource_type == resource_type)
    if action is not None:
        q_base = q_base.where(AuditLog.action.ilike(f"%{action}%"))
        count_q = count_q.where(AuditLog.action.ilike(f"%{action}%"))
    if resource_id is not None:
        q_base = q_base.where(AuditLog.resource_id.ilike(f"%{resource_id}%"))
        count_q = count_q.where(AuditLog.resource_id.ilike(f"%{resource_id}%"))
    if date_from is not None:
        q_base = q_base.where(AuditLog.created_at >= date_from)
        count_q = count_q.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        q_base = q_base.where(AuditLog.created_at <= date_to)
        count_q = count_q.where(AuditLog.created_at <= date_to)
    if q is not None:
        search_pattern = f"%{q}%"
        q_base = q_base.where(
            (AuditLog.action.ilike(search_pattern))
            | (AuditLog.resource_type.ilike(search_pattern))
            | (AuditLog.resource_id.ilike(search_pattern))
        )
        count_q = count_q.where(
            (AuditLog.action.ilike(search_pattern))
            | (AuditLog.resource_type.ilike(search_pattern))
            | (AuditLog.resource_id.ilike(search_pattern))
        )

    # Get total count
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    # Execute paginated query
    q_base = (
        q_base.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    result = await db.execute(q_base)
    items = result.scalars().unique().all()

    # Enrich items with user/branch names
    enriched_items = []
    for item in items:
        user_display_name = None
        if item.user is not None:
            user_display_name = (
                display_person_name(
                    item.user.first_name, item.user.father_name, item.user.family_name
                )
                or item.user.email
            )
        branch_name = None
        if item.branch is not None:
            branch_name = item.branch.name
        elif item.user is not None and item.user.branch is not None:
            branch_name = item.user.branch.name

        data = {
            "id": item.id,
            "created_at": item.created_at,
            "user_id": item.user_id,
            "branch_id": item.branch_id,
            "action": item.action,
            "resource_type": item.resource_type,
            "resource_id": item.resource_id,
            "old_value": item.old_value,
            "new_value": item.new_value,
            "ip_address": item.ip_address,
            "user_agent": item.user_agent,
            "request_id": item.request_id,
            "user_display_name": user_display_name,
            "user_email": item.user.email if item.user else None,
            "branch_name": branch_name,
        }
        enriched_items.append(AuditLogRead.model_validate(data))

    pages = max(1, (total + page_size - 1) // page_size)

    return AuditLogListResponse(
        items=enriched_items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )
