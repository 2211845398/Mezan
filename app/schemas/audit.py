"""Pydantic schemas for audit log API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
    # Enriched fields (optional, populated via joins)
    user_display_name: str | None = Field(default=None, description="User full name")
    user_email: str | None = Field(default=None, description="User email")
    branch_name: str | None = Field(default=None, description="Branch name")


class AuditLogListResponse(BaseModel):
    """Paginated audit log list."""

    items: list[AuditLogRead]
    total: int
    page: int
    page_size: int
    pages: int


class AuditLogFilters(BaseModel):
    """Available audit log filters (for API documentation)."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    user_id: int | None = None
    branch_id: int | None = None
    resource_type: str | None = None
    action: str | None = None
    resource_id: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    q: str | None = Field(
        default=None, description="Search query for action/resource_type/resource_id"
    )
