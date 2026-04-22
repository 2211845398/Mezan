"""Pydantic schemas for POS terminal API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TerminalCreate(BaseModel):
    """Register a new terminal. API key is returned only on create."""

    branch_id: int
    name: str
    terminal_code: str


class TerminalRead(BaseModel):
    """Terminal read (no API key)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    branch_id: int
    name: str
    terminal_code: str
    is_authorized: bool
    last_seen_at: datetime | None
    created_at: datetime


class TerminalCreateResponse(BaseModel):
    """Response after creating terminal; includes api_key once."""

    id: int
    branch_id: int
    name: str
    terminal_code: str
    is_authorized: bool
    api_key: str  # only returned on create


class TerminalUpdate(BaseModel):
    """Partial update (name / branch). Does not change terminal_code."""

    name: str | None = None
    branch_id: int | None = None
