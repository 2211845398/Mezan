"""Pydantic schemas for branch API."""

from pydantic import BaseModel, ConfigDict


class BranchCreate(BaseModel):
    """Create a branch."""

    name: str
    code: str
    address: str | None = None
    timezone: str = "UTC"


class BranchUpdate(BaseModel):
    """Update branch (partial)."""

    name: str | None = None
    address: str | None = None
    timezone: str | None = None
    is_active: bool | None = None


class BranchRead(BaseModel):
    """Branch read."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    address: str | None
    timezone: str
    is_active: bool
