"""Normalize user-facing labels into stable attribute/value codes."""

from __future__ import annotations

import hashlib
import re
import unicodedata


def normalize_attribute_code(raw: str, *, max_len: int = 64) -> str:
    """Build a stable ASCII-ish code from a label or explicit code input."""
    s = (raw or "").strip()
    if not s:
        return ""
    normalized = unicodedata.normalize("NFKD", s)
    parts: list[str] = []
    for ch in normalized:
        if ch.isalnum():
            parts.append(ch.upper())
        elif ch in "-_ ":
            parts.append("-")
    code = re.sub(r"-+", "-", "".join(parts)).strip("-")
    if not code:
        digest = hashlib.sha256(s.encode("utf-8")).hexdigest()[:12]
        code = f"V{digest.upper()}"
    return code[:max_len]
