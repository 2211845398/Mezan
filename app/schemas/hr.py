"""Pydantic schemas for employee HR feedback."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class HrFeedbackCreate(BaseModel):
    message: str = Field(min_length=3, max_length=4000)
    category: Literal["issue", "suggestion", "question"] | None = None


class HrFeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    employee_profile_id: int | None = None
    branch_id: int | None = None
    category: str | None = None
    message: str
    status: str
    created_at: datetime
