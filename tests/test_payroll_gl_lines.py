"""Payslip approval journal line construction."""

from __future__ import annotations

from decimal import Decimal

from app.services.document_posting_service import build_payslip_approved_journal_lines


def test_zero_net_omits_payroll_liability_line() -> None:
    lines = build_payslip_approved_journal_lines(
        gross=Decimal("90.00"),
        deductions=Decimal("90.00"),
        net=Decimal("0.00"),
        salary_expense_account_id=1,
        deductions_payable_account_id=2,
        payroll_liability_account_id=3,
        branch_id=10,
    )
    assert len(lines) == 2
    assert lines[0]["debit"] == Decimal("90.00")
    assert lines[1]["credit"] == Decimal("90.00")
    total_dr = sum(ln["debit"] for ln in lines)
    total_cr = sum(ln["credit"] for ln in lines)
    assert total_dr == total_cr


def test_positive_net_includes_liability_line() -> None:
    lines = build_payslip_approved_journal_lines(
        gross=Decimal("100.00"),
        deductions=Decimal("30.00"),
        net=Decimal("70.00"),
        salary_expense_account_id=1,
        deductions_payable_account_id=2,
        payroll_liability_account_id=3,
        branch_id=10,
    )
    assert len(lines) == 3
    assert lines[2]["credit"] == Decimal("70.00")
    total_dr = sum(ln["debit"] for ln in lines)
    total_cr = sum(ln["credit"] for ln in lines)
    assert total_dr == total_cr == Decimal("100.00")


def test_no_zero_value_lines() -> None:
    lines = build_payslip_approved_journal_lines(
        gross=Decimal("50.00"),
        deductions=Decimal("50.00"),
        net=Decimal("0.00"),
        salary_expense_account_id=1,
        deductions_payable_account_id=2,
        payroll_liability_account_id=3,
        branch_id=10,
    )
    for ln in lines:
        dr = ln["debit"]
        cr = ln["credit"]
        assert (dr > 0) ^ (cr > 0)
