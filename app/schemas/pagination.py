"""Shared paginated list response shape (limit/offset)."""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedListResponse[T](BaseModel):
    """Standard list payload: ``items``, ``total``, ``limit``, ``offset``."""

    items: list[T]
    total: int
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


def clamp_pagination(limit: int, offset: int, *, max_limit: int = 200) -> tuple[int, int]:
    """Normalize limit (1..max_limit) and offset (>= 0)."""
    return min(max(limit, 1), max_limit), max(offset, 0)
