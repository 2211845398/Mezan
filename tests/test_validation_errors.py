"""Tests for Pydantic validation error normalization."""

from __future__ import annotations

from app.utils.validation_errors import normalize_pydantic_error, normalize_pydantic_errors


def test_missing_field_maps_to_required_code() -> None:
    item = normalize_pydantic_error(
        {
            "type": "missing",
            "loc": ("body", "email"),
            "msg": "Field required",
            "input": None,
        }
    )
    assert item["code"] == "required"
    assert item["field"] == "email"
    assert item["path"] == "email"
    assert item["type"] == "missing"


def test_string_too_short_maps_to_min_length() -> None:
    item = normalize_pydantic_error(
        {
            "type": "string_too_short",
            "loc": ("body", "password"),
            "msg": "String should have at least 8 characters",
            "ctx": {"min_length": 8},
        }
    )
    assert item["code"] == "min_length"
    assert item["field"] == "password"
    assert item["params"] == {"min_length": 8}


def test_normalize_pydantic_errors_batch() -> None:
    raw = [
        {"type": "missing", "loc": ("body", "first_name"), "msg": "Field required"},
        {"type": "value_error.email", "loc": ("body", "email"), "msg": "value is not a valid email"},
    ]
    out = normalize_pydantic_errors(raw)
    assert len(out) == 2
    assert out[0]["code"] == "required"
    assert out[1]["code"] == "invalid_email"
