"""Append-only audit logging service."""

from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.models.audit_log import AuditLog


def _make_json_safe(obj: Any) -> Any:
    """Recursively convert datetime/date objects to ISO-format strings so dicts are JSON-serializable."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_json_safe(item) for item in obj]
    return obj


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
        old_value=_make_json_safe(old_value),
        new_value=_make_json_safe(new_value),
        ip_address=ip_address,
        user_agent=user_agent,
        request_id=request_id,
    )
    session.add(entry)
    await session.flush()  # so caller can commit in same transaction
