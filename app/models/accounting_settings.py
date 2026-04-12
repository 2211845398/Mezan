"""Singleton-style default GL accounts for automated posting (Epic 5)."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AccountingSettings(Base):
    """Single row (id=1) linking system defaults for automated journal posting."""

    __tablename__ = "accounting_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    base_currency_id: Mapped[int] = mapped_column(
        ForeignKey("currencies.id", ondelete="RESTRICT"), nullable=False
    )
    default_cash_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_ar_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_ap_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_inventory_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_cogs_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_sales_revenue_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_salary_expense_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_payroll_liability_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_payroll_deductions_payable_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
