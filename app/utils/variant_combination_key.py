"""Stable combination keys for product variants."""

from __future__ import annotations

DEFAULT_VARIANT_COMBINATION_KEY = "_default"


def build_combination_key(attribute_value_ids: list[int] | frozenset[int] | None) -> str:
    """Build a canonical key from sorted attribute value ids, or ``_default``."""
    if not attribute_value_ids:
        return DEFAULT_VARIANT_COMBINATION_KEY
    ids = sorted(int(v) for v in attribute_value_ids)
    return ",".join(str(i) for i in ids)
