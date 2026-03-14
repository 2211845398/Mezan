"""Pydantic schemas for audit log API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    """Single audit log entry (read-only)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    user_id: int | None
    branch_id: int | None
    action: str
    resource_type: str
    resource_id: str | None
    old_value: dict | None
    new_value: dict | None
    ip_address: str | None
    user_agent: str | None
    request_id: str | None


class AuditLogListResponse(BaseModel):
    """Paginated audit log list."""

    items: list[AuditLogRead]
    total: int
    page: int
    page_size: int
    pages: int
