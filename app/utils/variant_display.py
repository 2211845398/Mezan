"""Human-readable summaries for product variant attribute JSON."""

from __future__ import annotations

from typing import Any


def variant_attributes_summary(values: dict[str, Any] | None) -> str:
    """Join variant attribute key/value pairs for list views (stable key order)."""
    if not values:
        return ""
    parts = [f"{k}: {v}" for k, v in sorted(values.items(), key=lambda kv: kv[0])]
    return " · ".join(parts)
