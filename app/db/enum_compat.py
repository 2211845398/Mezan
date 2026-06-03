"""SQLAlchemy Enum compat for mixed DB storage (asset vs ASSET vs member names)."""

from __future__ import annotations

from enum import Enum as PyEnum

from sqlalchemy.sql.sqltypes import Enum as SQLAlchemyEnum


def coerce_pep435_enum(enum_class: type[PyEnum], raw: str) -> PyEnum:
    """Map DB strings to Python Enum members (value or legacy uppercase name)."""
    try:
        return enum_class(raw)  # type: ignore[call-arg]
    except ValueError:
        pass
    if raw in enum_class.__members__:
        return enum_class[raw]  # type: ignore[index]
    lowered = raw.lower()
    try:
        return enum_class(lowered)  # type: ignore[call-arg]
    except ValueError:
        pass
    upper = raw.upper()
    if upper in enum_class.__members__:
        return enum_class[upper]  # type: ignore[index]
    raise ValueError(f"{raw!r} is not a valid {enum_class.__name__}")


def patch_sqlalchemy_enum_value_compat() -> None:
    if getattr(SQLAlchemyEnum, "_mezan_value_compat_patched", False):
        return

    original = SQLAlchemyEnum._object_value_for_elem

    def _object_value_for_elem(self, elem):  # type: ignore[no-untyped-def]
        try:
            return original(self, elem)
        except (LookupError, KeyError):
            enum_class = getattr(self, "enum_class", None)
            if enum_class is not None and isinstance(elem, str):
                return coerce_pep435_enum(enum_class, elem)
            raise

    SQLAlchemyEnum._object_value_for_elem = _object_value_for_elem
    SQLAlchemyEnum._mezan_value_compat_patched = True
