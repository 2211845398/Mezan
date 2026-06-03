"""Display and SQL helpers for person-style names (first · father · family)."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement


def display_person_name(first: str | None, father: str | None, family: str | None) -> str:
    parts = [p.strip() for p in (first or "", father or "", family or "") if p and p.strip()]
    return " ".join(parts)


def person_name_sql_expr(
    first_col: ColumnElement, father_col: ColumnElement, family_col: ColumnElement
) -> ColumnElement:
    """Single trimmed display string for SQL selects (PostgreSQL ``concat_ws``)."""
    return func.nullif(func.trim(func.concat_ws(" ", first_col, father_col, family_col)), "")
