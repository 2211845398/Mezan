"""Display helpers for bilingual chart of account names."""

from __future__ import annotations

from typing import Protocol


class _CoaNameFields(Protocol):
    name: str
    name_ar: str | None
    name_en: str | None


def resolve_account_display_name(
    account: _CoaNameFields,
    locale: str | None = None,
) -> str:
    """Pick AR/EN label for UI and reports; fall back to legacy ``name``."""
    loc = (locale or "en").lower()
    if loc.startswith("ar"):
        if account.name_ar and account.name_ar.strip():
            return account.name_ar.strip()
    else:
        if account.name_en and account.name_en.strip():
            return account.name_en.strip()
    return account.name.strip() if account.name else ""


def normalize_coa_name_fields(
    *,
    name: str,
    name_ar: str | None = None,
    name_en: str | None = None,
) -> tuple[str, str | None, str | None]:
    """Return (legacy name, name_ar, name_en) with sensible fallbacks."""
    legacy = name.strip()
    ar = name_ar.strip() if name_ar and name_ar.strip() else None
    en = name_en.strip() if name_en and name_en.strip() else None
    if not legacy and not ar and not en:
        return "", None, None
    if not legacy:
        legacy = en or ar or ""
    if not en:
        en = legacy
    if not ar:
        ar = legacy
    return legacy, ar, en
