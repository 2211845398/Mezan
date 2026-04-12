"""Append-only audit logging service."""

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.models.audit_log import AuditLog


async def log(
    session: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    user_id: int | None = None,
    branch_id: int | None = None,
    request: Request | None = None,
) -> None:
    """
    Append one audit log entry. Uses request_id, ip_address, user_agent from request if provided.
    """
    request_id = None
    ip_address = None
    user_agent = None
    if request:
        request_id = getattr(request.state, "request_id", None)
        if request.client:
            ip_address = request.client.host
        user_agent = request.headers.get("user-agent")

    entry = AuditLog(
        user_id=user_id,
        branch_id=branch_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        old_value=jsonable_encoder(old_value) if old_value else None,
        new_value=jsonable_encoder(new_value) if new_value else None,
        ip_address=ip_address,
        user_agent=user_agent,
        request_id=request_id,
    )
    session.add(entry)
    await session.flush()
