"""Schemas for attendance kiosk devices."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AttendanceDeviceCreate(BaseModel):
    branch_id: int
    name: str = Field(min_length=1, max_length=255)
    device_code: str | None = Field(default=None, min_length=2, max_length=128)
    user_id: int | None = None
    kiosk_password: str | None = Field(default=None, min_length=8)
    kiosk_email: str | None = Field(default=None, min_length=3, max_length=255)
    kiosk_first_name: str | None = Field(default=None, min_length=1, max_length=255)
    kiosk_family_name: str | None = Field(default=None, max_length=255)


class AttendanceDeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    branch_id: int | None = None
    user_id: int | None = None
    is_active: bool | None = None
    kiosk_password: str | None = Field(default=None, min_length=8)
    kiosk_email: str | None = Field(default=None, min_length=3, max_length=255)
    kiosk_first_name: str | None = Field(default=None, min_length=1, max_length=255)
    kiosk_family_name: str | None = Field(default=None, max_length=255)


class KioskUserCandidateRead(BaseModel):
    id: int
    email: str
    first_name: str | None = None
    family_name: str | None = None
    branch_id: int | None = None


class AttendanceDeviceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    branch_id: int
    user_id: int | None
    name: str
    device_code: str
    is_active: bool
    qr_token_version: int
    last_seen_at: datetime | None
    created_at: datetime
    updated_at: datetime
    branch_name: str | None = None
    user_email: str | None = None


class AttendanceQrPayloadRead(BaseModel):
    qr_payload: str
    expires_in_seconds: int
    branch_id: int
    device_id: int
