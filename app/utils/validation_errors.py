"""Normalize FastAPI/Pydantic validation errors into stable client-facing codes."""

from __future__ import annotations

from typing import Any

_SKIP_LOC_PREFIXES = frozenset({"body", "query", "path", "header", "cookie"})

_TYPE_TO_CODE: dict[str, str] = {
    "missing": "required",
    "value_error.missing": "required",
    "string_too_short": "min_length",
    "string_too_long": "max_length",
    "too_short": "min_length",
    "too_long": "max_length",
    "value_error.email": "invalid_email",
    "string_type": "invalid_type",
    "int_parsing": "invalid_type",
    "float_parsing": "invalid_type",
    "bool_parsing": "invalid_type",
    "int_type": "invalid_type",
    "float_type": "invalid_type",
}


def _field_path_from_loc(loc: object) -> tuple[str, str] | None:
    if not isinstance(loc, (list, tuple)):
        return None
    parts = [
        str(part)
        for part in loc
        if not (isinstance(part, str) and part in _SKIP_LOC_PREFIXES)
    ]
    if not parts:
        return None
    path = ".".join(parts)
    field = parts[-1]
    return field, path


def _code_from_type(typ: str, msg: str) -> str:
    if typ in _TYPE_TO_CODE:
        return _TYPE_TO_CODE[typ]
    if "email" in typ or (typ.startswith("value_error") and "email" in msg.lower()):
        return "invalid_email"
    if typ.startswith("value_error"):
        return "invalid_value"
    return "invalid_value"


def normalize_pydantic_error(item: dict[str, Any]) -> dict[str, Any]:
    """Map one Pydantic error dict to a stable envelope item for API clients."""
    loc = item.get("loc")
    typ = str(item.get("type", ""))
    msg = str(item.get("msg", ""))
    path_info = _field_path_from_loc(loc)
    field = path_info[0] if path_info else ""
    path = path_info[1] if path_info else ""

    params: dict[str, Any] = {}
    ctx = item.get("ctx")
    if isinstance(ctx, dict):
        if "min_length" in ctx:
            params["min_length"] = ctx["min_length"]
        if "max_length" in ctx:
            params["max_length"] = ctx["max_length"]

    return {
        "field": field,
        "path": path,
        "code": _code_from_type(typ, msg),
        "params": params,
        "loc": loc,
        "msg": msg,
        "type": typ,
    }


def normalize_pydantic_errors(raw_errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [normalize_pydantic_error(item) for item in raw_errors]
