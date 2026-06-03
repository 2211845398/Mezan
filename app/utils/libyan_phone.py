"""Libyan national phone numbers (domestic format, no country prefix)."""

from __future__ import annotations

import re

# 09 + operator digit 1–5 + seven subscriber digits (10 digits total).
LIBYAN_MOBILE_RE = re.compile(r"^09[1-5]\d{7}$")


def normalize_libyan_mobile_input(raw: str) -> str:
    """Remove whitespace only; value must still match ``LIBYAN_MOBILE_RE``."""
    return "".join(raw.split())


def require_libyan_mobile(value: str) -> str:
    """Return normalized phone or raise ``ValueError('invalid_libyan_phone')``."""
    s = normalize_libyan_mobile_input(value.strip())
    if not LIBYAN_MOBILE_RE.fullmatch(s):
        raise ValueError("invalid_libyan_phone")
    return s
