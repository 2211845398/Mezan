"""Pydantic schemas for branch API."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BranchKindLiteral = Literal["commercial", "warehouse"]


class BranchCreate(BaseModel):
    """Create a branch."""

    name: str
    code: str
    address: str | None = None
    timezone: str = "UTC"
    kind: BranchKindLiteral = Field(
        default="commercial",
        description="commercial = retail/POS; warehouse = inventory/purchasing",
    )


class BranchUpdate(BaseModel):
    """Update branch (partial)."""

    name: str | None = None
    address: str | None = None
    timezone: str | None = None
    kind: BranchKindLiteral | None = None
    is_active: bool | None = None
    unarchive: bool | None = None


class BranchRead(BaseModel):
    """Branch read."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    address: str | None
    timezone: str
    kind: BranchKindLiteral
    is_active: bool
    archived_at: datetime | None
    accounting_chart_provisioned_at: datetime | None = None
