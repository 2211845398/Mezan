"""Smoke tests for standardized PDF / .xlsx report exports."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.services.payroll_export_service import build_payroll_period_xlsx, build_payslip_xlsx
from app.services.sales_invoice_export_service import _build_document_xlsx


def test_payroll_period_xlsx_is_real_xlsx() -> None:
    raw = build_payroll_period_xlsx(
        period_start=date(2026, 4, 1),
        period_end=date(2026, 4, 30),
        rows=[
            {
                "employee_profile_id": 1,
                "user_full_name": "Test User",
                "user_role_code": "cashier",
                "base_salary": "1000.00",
                "hourly_rate": "0",
                "gross_amount": "1000.00",
                "automatic_deductions_amount": "0",
                "manual_deductions_amount": "0",
                "bonus_amount": "0",
                "overtime_amount": "0",
                "net_amount": "1000.00",
                "payslip_status": "approved",
                "paid_at": None,
            }
        ],
        locale="ar",
    )
    assert raw[:2] == b"PK"
    assert len(raw) > 200


def test_sales_invoice_xlsx_builder_ar_rtl() -> None:
    raw = _build_document_xlsx(
        locale="ar",
        title="فاتورة",
        company_name="Mezan",
        branch_name="Main",
        currency_code="USD",
        document_number="INV-1",
        customer_name="Walk-in",
        created_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        lines=[
            {
                "product_name": "Item",
                "variant_label": "SKU-1",
                "qty": 1,
                "unit_price": Decimal("10.00"),
                "line_total": Decimal("10.00"),
            }
        ],
        subtotal=Decimal("10.00"),
        discount_total=Decimal("0"),
        tax_total=Decimal("0"),
        total=Decimal("10.00"),
    )
    assert raw[:2] == b"PK"


def test_payslip_xlsx_builder_en() -> None:
    raw = build_payslip_xlsx(
        {
            "employee_profile_id": 2,
            "user_full_name": "Employee",
            "period_start": "2026-04-01",
            "period_end": "2026-04-30",
            "base_salary_amount": "800",
            "hours_worked": "160",
            "hourly_rate": "5",
            "gross_amount": "800",
            "automatic_deductions_amount": "0",
            "manual_deductions_amount": "0",
            "bonus_amount": "0",
            "overtime_amount": "0",
            "net_amount": "800",
            "status": "approved",
            "paid_at": None,
        },
        locale="en",
    )
    assert raw[:2] == b"PK"
