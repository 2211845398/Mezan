"""Notification generator registry.

A generator is a ``callable(db, params) -> list[GeneratedNotification]`` that
produces zero or more deterministic (recipient, idempotency_key, context)
tuples for a given schedule tick.

Generators are intentionally small and focused so that tests can assert their
output against a seeded database without any provider in the loop.
"""

from __future__ import annotations

from app.services.notifications.generators import registry  # noqa: F401  (side-effect: registers)
from app.services.notifications.generators.base import (
    GeneratedNotification,
    NotificationGenerator,
    get_generator,
    list_generator_kinds,
    register_generator,
)

__all__ = [
    "GeneratedNotification",
    "NotificationGenerator",
    "get_generator",
    "list_generator_kinds",
    "register_generator",
]
