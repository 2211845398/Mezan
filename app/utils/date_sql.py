"""Helpers for calendar-day SQL filtering against timestamp columns."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement

CalendarBound = date | datetime


def _calendar_date(value: CalendarBound) -> date:
    return value.date() if isinstance(value, datetime) else value


def calendar_day_range(
    column: Any,
    *,
    start: CalendarBound | None = None,
    end: CalendarBound | None = None,
) -> list[ColumnElement[bool]]:
    """Build inclusive calendar-day predicates for a DateTime column."""
    predicates: list[ColumnElement[bool]] = []
    if start is not None:
        predicates.append(func.date(column) >= _calendar_date(start))
    if end is not None:
        predicates.append(func.date(column) <= _calendar_date(end))
    return predicates
