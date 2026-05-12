"""Pydantic schemas for Chart of Accounts (Epic 19.9)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.chart_accounts import AccountType


class ChartAccountRead(BaseModel):
    """Chart of Accounts entry read model."""

    id: int
    code: str
    name: str
    account_type: AccountType
    parent_id: int | None
    is_control: bool
    is_system: bool
    active: bool
    depth: int = 0  # Computed field

    class Config:
        from_attributes = True


class ChartAccountCreate(BaseModel):
    """Create a new Chart of Accounts entry."""

    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=255)
    account_type: AccountType
    parent_id: int | None = Field(None, description="Parent account ID (null for root)")
    is_control: bool = Field(default=False)
    active: bool = Field(default=True)


class ChartAccountUpdate(BaseModel):
    """Update a Chart of Accounts entry."""

    code: str | None = Field(None, min_length=1, max_length=32)
    name: str | None = Field(None, min_length=1, max_length=255)
    account_type: AccountType | None = None
    parent_id: int | None = Field(None, description="Parent account ID (null for root)")
    is_control: bool | None = None
    active: bool | None = None


class ChartAccountTreeNode(BaseModel):
    """Tree node for Chart of Accounts hierarchy."""

    id: int
    code: str
    name: str
    account_type: AccountType
    is_control: bool
    is_system: bool
    active: bool
    depth: int
    children: list["ChartAccountTreeNode"] = []

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
