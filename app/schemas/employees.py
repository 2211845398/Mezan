"""Pydantic schemas for employee HR workflows (Epic 4.1/4.2)."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.libyan_validators import (
    validate_annual_leave_entitlement_days,
    validate_employee_identity_and_bank,
)

from app.schemas.pagination import PaginatedListResponse


class EmployeeProfileCreate(BaseModel):
    user_id: int
    hire_date: date
    base_salary: Decimal | None = None
    hourly_rate: Decimal | None = None
    bank_account: str | None = None
    annual_leave_entitlement_days: Decimal | None = None
    identity_document_type: str | None = Field(default=None, max_length=32)
    identity_document_number: str | None = Field(default=None, max_length=128)

    @field_validator("annual_leave_entitlement_days")
    @classmethod
    def _annual_leave_whole(cls, v: Decimal | None) -> Decimal | None:
        validate_annual_leave_entitlement_days(v)
        return v

    def model_post_init(self, __context: object) -> None:
        validate_employee_identity_and_bank(
            identity_document_type=self.identity_document_type,
            identity_document_number=self.identity_document_number,
            bank_account=self.bank_account,
        )


class EmployeeProfileUpdate(BaseModel):
    hire_date: date | None = None
    base_salary: Decimal | None = None
    hourly_rate: Decimal | None = None
    bank_account: str | None = None
    annual_leave_entitlement_days: Decimal | None = None
    identity_document_type: str | None = Field(default=None, max_length=32)
    identity_document_number: str | None = Field(default=None, max_length=128)

    @field_validator("annual_leave_entitlement_days")
    @classmethod
    def _annual_leave_whole(cls, v: Decimal | None) -> Decimal | None:
        validate_annual_leave_entitlement_days(v)
        return v

    def model_post_init(self, __context: object) -> None:
        validate_employee_identity_and_bank(
            identity_document_type=self.identity_document_type,
            identity_document_number=self.identity_document_number,
            bank_account=self.bank_account,
        )
    # Linked user (via employees:update); email and status are not editable here.
    subject_first_name: str | None = None
    subject_father_name: str | None = None
    subject_family_name: str | None = None
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
    annual_leave_entitlement_days: Decimal | None = None
    identity_document_type: str | None = None
    identity_document_number: str | None = None
    identity_document_image_url: str | None = None
    created_at: datetime
    updated_at: datetime
    # Enriched user details
    user_email: str | None = None
    user_first_name: str | None = None
    user_father_name: str | None = None
    user_family_name: str | None = None
    user_full_name: str | None = None
    user_status: str | None = None
    user_branch_id: int | None = None
    user_branch_name: str | None = None
    user_role_code: str | None = None
    user_role_name: str | None = None


class EmployeeListResponse(PaginatedListResponse[EmployeeProfileRead]):
    """Paginated employee profile list."""


class IdentityDocumentImageResponse(BaseModel):
    """Response after uploading a passport / national ID scan."""

    image_url: str


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
    attendance_category: str | None = None
    classification_status: str | None = None
    payroll_impact_amount: Decimal | None = None
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    late_minutes: int | None = None
    early_close_minutes: int | None = None
    overtime_minutes: int | None = None
    policy_snapshot: dict | None = None
    employee_user_full_name: str | None = None
    employee_user_email: str | None = None


class AttendanceLogListResponse(PaginatedListResponse[AttendanceLogRead]):
    """Paginated attendance log list for HR dashboards."""


class AttendanceSummaryRead(BaseModel):
    """Aggregated HR attendance stats for a filtered window."""

    by_status: dict[str, int]
    overtime_minutes_total: float
    record_count: int
    absent_days: int


class LeaveRequestCreate(BaseModel):
    leave_type: Literal["vacation", "sick", "personal"]
    start_date: date
    end_date: date
    reason: str | None = None


class LeaveRequestReview(BaseModel):
    action: Literal["approve", "reject"]
    review_notes: str | None = Field(default=None, max_length=1024)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class VacationLeaveBalanceRead(BaseModel):
    """Annual vacation balance for the calendar year (UTC date)."""

    calendar_year: int
    entitlement_days: Decimal | None = None
    used_days: Decimal
    remaining_days: Decimal | None = None


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
    vacation_balance_remaining: Decimal | None = None
