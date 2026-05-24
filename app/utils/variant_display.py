"""Human-readable summaries for product variant attribute JSON."""

from __future__ import annotations

from typing import Any


def variant_attributes_summary(values: dict[str, Any] | None) -> str:
    """Join variant attribute key/value pairs for list views (stable key order)."""
    if not values:
        return ""
    parts = [f"{k}: {v}" for k, v in sorted(values.items(), key=lambda kv: kv[0])]
    return " · ".join(parts)


def _human_attribute_values(values: dict[str, Any] | None) -> list[str]:
    if not values:
        return []
    labels: list[str] = []
    for k, v in sorted(values.items(), key=lambda kv: kv[0]):
        if k == "_default":
            continue
        text = str(v).strip() if v is not None else ""
        if text:
            labels.append(text)
    return labels


def variant_value_labels_summary(values: dict[str, Any] | None) -> str:
    """Human labels only, e.g. '10 متر · أحمر' (no attribute codes)."""
    parts = _human_attribute_values(values)
    return " · ".join(parts)


def format_purchasing_variant_option(
    *,
    display_name: str,
    sku: str,
    barcode: str | None,
    attribute_values: dict[str, Any] | None,
) -> str:
    """Purchasing/receiving picker label: ``[barcode|sku] name — variant suffix``."""
    code = (barcode or sku or "").strip()
    name = display_name.strip()
    suffix = variant_value_labels_summary(attribute_values)
    if suffix:
        return f"[{code}] {name} — {suffix}"
    return f"[{code}] {name}"
