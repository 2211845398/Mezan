"""Chart of accounts (global; Epic 5)."""

from __future__ import annotations

from enum import StrEnum as PyEnum

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AccountType(PyEnum):
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"


class SubledgerKind(PyEnum):
    NONE = "none"
    CUSTOMER = "customer"
    SUPPLIER = "supplier"
    EMPLOYEE = "employee"


class ChartAccount(Base):
    """GL account node.

    Group vs posting leaf (master-prompt ``is_group_account``):
    - **Group / control:** ``is_control=True`` or ``is_leaf=False`` — no direct posting.
    - **Posting leaf:** ``is_leaf=True`` and ``is_control=False``.
    """

    __tablename__ = "chart_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_ar: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name_en: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_type: Mapped[AccountType] = mapped_column(
        Enum(
            AccountType,
            native_enum=False,
            values_callable=lambda cls: [m.value for m in cls],
        ),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_control: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_leaf: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    subledger_kind: Mapped[SubledgerKind] = mapped_column(
        Enum(
            SubledgerKind,
            native_enum=False,
            values_callable=lambda cls: [m.value for m in cls],
        ),
        nullable=False,
        default=SubledgerKind.NONE,
    )
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    branch_id: Mapped[int | None] = mapped_column(
        ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    pos_terminal_id: Mapped[int | None] = mapped_column(
        ForeignKey("pos_terminals.id", ondelete="SET NULL"), nullable=True, index=True
    )
