"""Resolve UI locale from HTTP Accept-Language (mirrors web i18n)."""

from __future__ import annotations

from typing import Literal

RequestLocale = Literal["ar", "en"]


def resolve_request_locale(accept_language: str | None) -> RequestLocale:
    if not accept_language:
        return "ar"
    primary = accept_language.split(",")[0].strip().lower()
    if primary.startswith("en"):
        return "en"
    return "ar"
