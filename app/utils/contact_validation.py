"""Shared optional email / phone checks for API request bodies."""

from __future__ import annotations

from typing import Any

from pydantic import EmailStr, TypeAdapter

from app.utils.libyan_phone import require_libyan_mobile

_email_adapter = TypeAdapter(EmailStr)


def parse_optional_email(value: object | None) -> str | None:
    """Empty or whitespace-only strings become ``None``; otherwise validate as email."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return str(_email_adapter.validate_python(s))


def validate_supplier_contact_dict(contact: dict[str, Any] | None) -> None:
    """Validate ``contact.phone`` / ``contact.email`` when non-empty (raises Pydantic errors)."""
    if not contact:
        return
    raw_phone = contact.get("phone")
    if raw_phone is not None and str(raw_phone).strip():
        require_libyan_mobile(str(raw_phone))
    raw_email = contact.get("email")
    if raw_email is not None and str(raw_email).strip():
        parse_optional_email(raw_email)
