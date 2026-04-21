"""Generator base types and process-wide registry."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class GeneratedNotification:
    """One deterministic notification produced by a generator.

    ``user_ids`` is the list of recipients for this single payload. ``context``
    is merged into the template's default data and formatted into title/body via
    ``str.format``. ``idempotency_key`` must be stable for the same subject in
    the same window (e.g. include product_id and date).
    """

    user_ids: list[int]
    idempotency_key: str
    context: dict[str, Any] = field(default_factory=dict)
    title_override: str | None = None
    body_override: str | None = None
    data_override: dict[str, Any] | None = None


NotificationGenerator = Callable[
    [AsyncSession, dict[str, Any]], Awaitable[list[GeneratedNotification]]
]


_REGISTRY: dict[str, NotificationGenerator] = {}


def register_generator(kind: str) -> Callable[[NotificationGenerator], NotificationGenerator]:
    """Decorator that registers a generator under a stable ``kind`` string."""

    def _inner(fn: NotificationGenerator) -> NotificationGenerator:
        _REGISTRY[kind] = fn
        return fn

    return _inner


def get_generator(kind: str) -> NotificationGenerator | None:
    return _REGISTRY.get(kind)


def list_generator_kinds() -> list[str]:
    return sorted(_REGISTRY.keys())
