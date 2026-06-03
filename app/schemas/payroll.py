"""Pydantic schemas for payroll workflows (Epic 4.3/4.4)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.pagination import PaginatedListResponse


class PayslipGenerateRequest(BaseModel):
    employee_profile_id: int
    period_start: date
    period_end: date
    deductions: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        description="Manual deductions only; automatic attendance deductions are added server-side.",
    )
    hourly_rate_override: Decimal | None = Field(default=None, ge=0)
    bonus_amount: Decimal | None = Field(default=None, ge=0)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class PayslipApproveRequest(BaseModel):
    payslip_id: int
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class PayslipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_profile_id: int
    period_start: date
    period_end: date
    hours_worked: Decimal
    hourly_rate: Decimal
    deductions: Decimal
    gross_amount: Decimal
    net_amount: Decimal
    status: Literal["draft", "approved"]
    immutable_hash: str
    approved_by_user_id: int | None = None
    approved_at: datetime | None = None
    generate_idempotency_key: str | None = None
    approve_idempotency_key: str | None = None
    created_at: datetime
    base_salary_amount: Decimal | None = None
    bonus_amount: Decimal | None = None
    overtime_amount: Decimal | None = None
    automatic_deductions_amount: Decimal | None = None
    manual_deductions_amount: Decimal | None = None
    calculation_details: dict | None = None
    paid_at: datetime | None = None
    paid_by_user_id: int | None = None
    user_full_name: str | None = None
    user_email: str | None = None


class PayslipListResponse(PaginatedListResponse[PayslipRead]):
    """Paginated payslip list."""


class PayslipAdjustmentsPatch(BaseModel):
    bonus_amount: Decimal | None = Field(default=None, ge=0)
    manual_deductions: Decimal | None = Field(default=None, ge=0)


class PayrollApproveAndPayRequest(BaseModel):
    period_start: date
    period_end: date
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class PayrollIdempotencyBody(BaseModel):
    """Optional idempotency key in JSON body (header ``Idempotency-Key`` also accepted)."""

    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class PayrollOverviewRow(BaseModel):
    employee_profile_id: int
    user_email: str | None = None
    user_full_name: str | None = None
    user_role_code: str | None = None
    base_salary: Decimal | None = None
    hourly_rate: Decimal | None = None
    payslip_id: int | None = None
    payslip_status: str
    paid_at: datetime | None = None
    gross_amount: Decimal | None = None
    net_amount: Decimal | None = None
    deductions_total: Decimal | None = None
    automatic_deductions_amount: Decimal | None = None
    manual_deductions_amount: Decimal | None = None
    bonus_amount: Decimal | None = None
    overtime_amount: Decimal | None = None
    base_salary_amount: Decimal | None = None


class PayrollPeriodSummary(BaseModel):
    employees_total: int
    payslips_missing: int
    payslips_draft: int
    payslips_approved_unpaid: int
    payslips_paid: int
    gross_total: Decimal
    net_total: Decimal
    automatic_deductions_total: Decimal
    manual_deductions_total: Decimal
    bonus_total: Decimal


class PayrollPeriodRead(BaseModel):
    year: int
    month: int
    period_start: date
    period_end: date
    approval_opens_on: date
    is_approval_open: bool
    summary: PayrollPeriodSummary
    rows: list[PayrollOverviewRow]


class PayrollPeriodPrepareFailure(BaseModel):
    employee_profile_id: int
    message: str
    code: str | None = None


class PayrollPeriodPrepareResult(BaseModel):
    year: int
    month: int
    period_start: date
    period_end: date
    created_count: int
    recalculated_count: int = 0
    skipped_existing_count: int
    skipped_inactive_count: int
    failures: list[PayrollPeriodPrepareFailure]


class AttendancePayrollPolicyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role_code: str
    attendance_category: str
    grace_minutes: int
    absence_deduction_amount: Decimal
    late_deduction_amount: Decimal
    early_close_deduction_amount: Decimal
    overtime_multiplier: Decimal
    is_active: bool


class AttendancePayrollPolicyUpsert(BaseModel):
    attendance_category: Literal["exempt", "office", "operational"]
    grace_minutes: int = Field(ge=0, le=24 * 60)
    absence_deduction_amount: Decimal = Field(ge=0)
    late_deduction_amount: Decimal = Field(ge=0)
    early_close_deduction_amount: Decimal = Field(ge=0)
    overtime_multiplier: Decimal = Field(ge=1)
    is_active: bool = True
