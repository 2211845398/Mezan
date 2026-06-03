"""Pydantic schemas for the notification subsystem (Epic 13)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ── Device tokens ─────────────────────────────────────────────────────────────


class DeviceTokenRegisterRequest(BaseModel):
    platform: str = Field(..., description="web / android / ios")
    token: str = Field(..., min_length=8, max_length=512)
    device_label: str | None = Field(default=None, max_length=128)
    app_version: str | None = Field(default=None, max_length=64)


class DeviceTokenRead(BaseModel):
    id: int
    user_id: int
    platform: str
    device_label: str | None
    app_version: str | None
    last_seen_at: datetime
    revoked_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DeviceTokenListResponse(BaseModel):
    items: list[DeviceTokenRead]


# ── Templates ─────────────────────────────────────────────────────────────────


class NotificationTemplateUpsert(BaseModel):
    kind: str = Field(..., min_length=1, max_length=64)
    title_template: str = Field(..., max_length=255)
    body_template: str
    default_data: dict = Field(default_factory=dict)
    is_active: bool = True


class NotificationTemplateRead(BaseModel):
    id: int
    kind: str
    title_template: str
    body_template: str
    default_data: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Schedules ─────────────────────────────────────────────────────────────────


class NotificationScheduleUpsert(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    kind: str = Field(..., min_length=1, max_length=64)
    interval_minutes: int = Field(default=60, ge=1, le=7 * 24 * 60)
    target_role_code: str | None = Field(default=None, max_length=64)
    branch_id: int | None = None
    parameters: dict = Field(default_factory=dict)
    is_active: bool = True


class NotificationScheduleRead(BaseModel):
    id: int
    name: str
    kind: str
    interval_minutes: int
    target_role_code: str | None
    branch_id: int | None
    owner_user_id: int | None = None
    parameters: dict
    is_active: bool
    last_run_at: datetime | None
    next_run_at: datetime | None

    model_config = {"from_attributes": True}


class NotificationScheduleListResponse(BaseModel):
    items: list[NotificationScheduleRead]


# ── Runs & deliveries ─────────────────────────────────────────────────────────


class NotificationRunRead(BaseModel):
    id: int
    schedule_id: int
    status: str
    started_at: datetime
    finished_at: datetime | None
    deliveries_enqueued: int
    error_message: str | None

    model_config = {"from_attributes": True}


class NotificationDeliveryRead(BaseModel):
    id: int
    schedule_id: int | None
    user_id: int
    template_kind: str
    title: str
    body: str
    data: dict
    status: str
    provider: str
    provider_message_id: str | None
    error_code: str | None
    error_message: str | None
    created_at: datetime
    sent_at: datetime | None
    read_at: datetime | None

    model_config = {"from_attributes": True}


class NotificationDeliveryListResponse(BaseModel):
    items: list[NotificationDeliveryRead]


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int


class NotificationMarkReadResponse(BaseModel):
    updated: int


class NotificationBroadcastRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    target_type: Literal["all", "role"] = "all"
    # Singular fields kept for backward compatibility; merged with list fields in the API layer.
    role_code: str | None = Field(default=None, max_length=64)
    role_codes: list[str] | None = None
    branch_id: int | None = None
    branch_ids: list[int] | None = None
    data: dict = Field(default_factory=dict)


class NotificationBroadcastResponse(BaseModel):
    deliveries_created: int
    deliveries_sent: int
    deliveries_failed: int
    deliveries_skipped: int


class ScheduleTriggerResponse(BaseModel):
    schedule_id: int
    run_id: int
    deliveries_enqueued: int
    deliveries_sent: int
    deliveries_failed: int
