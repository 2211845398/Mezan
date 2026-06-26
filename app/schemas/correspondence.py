"""Pydantic schemas for staff correspondence."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CorrespondenceRequestTypeLiteral = Literal["administrative", "hr", "it", "finance", "general"]
CorrespondenceStatusLiteral = Literal["open", "answered", "closed"]


class CorrespondenceThreadCreate(BaseModel):
    subject: str = Field(min_length=2, max_length=255)
    request_type: CorrespondenceRequestTypeLiteral = "general"
    target_role_code: str | None = Field(default=None, max_length=64)
    target_user_id: int | None = None
    body: str = Field(min_length=3, max_length=8000)


class CorrespondenceMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    is_internal_note: bool = False


class CorrespondenceThreadStatusUpdate(BaseModel):
    status: CorrespondenceStatusLiteral


class CorrespondenceMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    sender_user_id: int
    body: str
    is_internal_note: bool
    created_at: datetime


class CorrespondenceThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    request_type: str
    initiator_user_id: int
    target_role_code: str
    target_user_id: int | None = None
    branch_id: int | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class CorrespondenceThreadDetail(CorrespondenceThreadRead):
    messages: list[CorrespondenceMessageRead] = []
