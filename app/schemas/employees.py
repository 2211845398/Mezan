"""Pydantic schemas for employee HR workflows (Epic 4.1/4.2)."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class EmployeeProfileCreate(BaseModel):
    user_id: int
    hire_date: date
    base_salary: Decimal | None = None
    hourly_rate: Decimal | None = None
    bank_account: str | None = None


class EmployeeProfileUpdate(BaseModel):
    hire_date: date | None = None
    base_salary: Decimal | None = None
    hourly_rate: Decimal | None = None
    bank_account: str | None = None
    # Linked user (via employees:update); email and status are not editable here.
    subject_full_name: str | None = None
    subject_branch_id: int | None = None
    subject_role_code: str | None = None


class EmployeeProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    hire_date: date
    base_salary: Decimal | None = None
    hourly_rate: Decimal | None = None
    bank_account: str | None = None
    created_at: datetime
    updated_at: datetime
    # Enriched user details
    user_email: str | None = None
    user_full_name: str | None = None
    user_status: str | None = None
    user_branch_id: int | None = None
    user_branch_name: str | None = None
    user_role_code: str | None = None
    user_role_name: str | None = None


class WeeklyScheduleCreate(BaseModel):
    branch_id: int
    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    is_day_off: bool = False


class WeeklyScheduleUpdate(BaseModel):
    start_time: time | None = None
    end_time: time | None = None
    is_day_off: bool | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    branch_id: int | None = None


class WeeklyScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_profile_id: int
    branch_id: int
    weekday: int
    start_time: time
    end_time: time
    is_day_off: bool
    created_at: datetime
    updated_at: datetime


class AttendanceClockInRequest(BaseModel):
    branch_id: int
    clock_in_at: datetime | None = None


class AttendanceClockOutRequest(BaseModel):
    clock_out_at: datetime | None = None


class AttendanceLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_profile_id: int
    branch_id: int
    clock_in_at: datetime
    clock_out_at: datetime | None = None
    created_at: datetime


class LeaveRequestCreate(BaseModel):
    leave_type: Literal["vacation", "sick", "personal"]
    start_date: date
    end_date: date
    reason: str | None = None


class LeaveRequestReview(BaseModel):
    action: Literal["approve", "reject"]
    review_notes: str | None = Field(default=None, max_length=1024)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class LeaveRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_profile_id: int
    leave_type: Literal["vacation", "sick", "personal"]
    status: Literal["pending", "approved", "rejected"]
    start_date: date
    end_date: date
    reason: str | None = None
    reviewed_by_user_id: int | None = None
    reviewed_at: datetime | None = None
    review_notes: str | None = None
    created_at: datetime
    updated_at: datetime
