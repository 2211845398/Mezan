"""Singleton-style default GL accounts for automated posting (Epic 5)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AccountingSettings(Base):
    """Single row (id=1) linking system defaults for automated journal posting."""

    __tablename__ = "accounting_settings"
    __table_args__ = (
        CheckConstraint(
            "inventory_valuation_policy IN ('wavg','fifo')",
            name="ck_accounting_settings_inventory_valuation_policy",
        ),
    )

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
    default_card_clearing_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_other_clearing_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_sales_discount_account_id: Mapped[int] = mapped_column(
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
    default_output_tax_payable_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_cash_over_short_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_rounding_difference_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=True
    )
    default_loyalty_liability_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    default_loyalty_expense_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    inventory_valuation_policy: Mapped[str] = mapped_column(
        String(8), nullable=False, default="wavg"
    )
    default_wip_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=True
    )
    default_inventory_shortage_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=True
    )
    default_inventory_damaged_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=True
    )
    default_inventory_gain_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=True
    )
    default_other_expenses_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=True
    )
    default_loyalty_point_value: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), nullable=False, default=Decimal("0.0100")
    )
