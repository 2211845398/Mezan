"""Pydantic schemas for global config API."""

from pydantic import BaseModel, ConfigDict


class GlobalConfigRead(BaseModel):
    """Single config entry."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    value: dict | None
    description: str | None


class GlobalConfigUpdate(BaseModel):
    """Update config value and optional description."""

    value: dict | str | int | float | bool
    description: str | None = None
