"""Pydantic schemas for Chart of Accounts (Epic 19.9)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.chart_accounts import AccountType, SubledgerKind


class ChartAccountRead(BaseModel):
    """Chart of Accounts entry read model."""

    id: int
    code: str
    name: str
    name_ar: str | None = None
    name_en: str | None = None
    account_type: AccountType
    parent_id: int | None
    is_control: bool
    is_leaf: bool = True
    subledger_kind: SubledgerKind = SubledgerKind.NONE
    is_system: bool
    active: bool
    branch_id: int | None = None
    pos_terminal_id: int | None = None
    depth: int = 0  # Computed field

    class Config:
        from_attributes = True


class PostableChartAccountRead(BaseModel):
    """Leaf posting account for journal line pickers."""

    id: int
    code: str
    name: str
    name_ar: str | None = None
    name_en: str | None = None
    account_type: AccountType
    parent_id: int | None
    parent_code: str | None = None
    parent_name: str | None = None
    subledger_kind: SubledgerKind = SubledgerKind.NONE
    is_leaf: bool = True
    active: bool = True
    branch_id: int | None = None
    pos_terminal_id: int | None = None


class ChartAccountCreate(BaseModel):
    """Create a new Chart of Accounts entry."""

    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=255)
    name_ar: str | None = Field(None, max_length=255)
    name_en: str | None = Field(None, max_length=255)
    account_type: AccountType
    parent_id: int | None = Field(None, description="Parent account ID (null for root)")
    is_control: bool = Field(default=False)
    subledger_kind: SubledgerKind = Field(default=SubledgerKind.NONE)
    active: bool = Field(default=True)
    branch_id: int | None = Field(
        None, description="Optional branch scope for cash/POS/inventory sub-ledgers"
    )
    pos_terminal_id: int | None = Field(
        None, description="Optional POS terminal scope (implies branch)"
    )


class ChartAccountUpdate(BaseModel):
    """Update a Chart of Accounts entry."""

    code: str | None = Field(None, min_length=1, max_length=32)
    name: str | None = Field(None, min_length=1, max_length=255)
    name_ar: str | None = Field(None, max_length=255)
    name_en: str | None = Field(None, max_length=255)
    account_type: AccountType | None = None
    parent_id: int | None = Field(None, description="Parent account ID (null for root)")
    is_control: bool | None = None
    subledger_kind: SubledgerKind | None = None
    active: bool | None = None
    branch_id: int | None = None
    pos_terminal_id: int | None = None


class ChartAccountSuggestCodeRead(BaseModel):
    """Suggested next account code under a parent group."""

    suggested_code: str | None = None


class ChartAccountTreeNode(BaseModel):
    """Tree node for Chart of Accounts hierarchy."""

    id: int
    code: str
    name: str
    name_ar: str | None = None
    name_en: str | None = None
    account_type: AccountType
    is_control: bool
    is_leaf: bool = True
    subledger_kind: SubledgerKind = SubledgerKind.NONE
    is_system: bool
    active: bool
    branch_id: int | None = None
    pos_terminal_id: int | None = None
    depth: int
    children: list["ChartAccountTreeNode"] = []

    class Config:
        from_attributes = True


class ChartAccountTreeBranchNode(BaseModel):
    """Tree node with branch-filtered trial balance (own row + subtree roll-up net)."""

    id: int
    code: str
    name: str
    name_ar: str | None = None
    name_en: str | None = None
    account_type: AccountType
    is_control: bool
    is_leaf: bool = True
    subledger_kind: SubledgerKind = SubledgerKind.NONE
    is_system: bool
    active: bool
    depth: int
    branch_total_debit: Decimal = Decimal("0")
    branch_total_credit: Decimal = Decimal("0")
    branch_net: Decimal = Decimal("0")
    branch_subtree_net: Decimal = Decimal("0")
    branch_id: int | None = None
    pos_terminal_id: int | None = None
    children: list["ChartAccountTreeBranchNode"] = []

    class Config:
        from_attributes = True


class ChartAccountMoveRequest(BaseModel):
    """Request to move an account to a new parent."""

    new_parent_id: int | None = Field(None, description="New parent ID (null for root)")


class ChartAccountDeleteCheck(BaseModel):
    """Check if account can be deleted."""

    can_delete: bool
    reason: str


class CoaTypeSummary(BaseModel):
    """Summary of accounts by type."""

    account_type: AccountType
    count: int
    root_count: int


ChartAccountTreeBranchNode.model_rebuild()
