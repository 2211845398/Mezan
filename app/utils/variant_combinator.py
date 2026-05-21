"""Cartesian product for variant attribute value IDs."""

from __future__ import annotations

from itertools import product


def cartesian_product_combos(
    axes: dict[int, list[int]],
    *,
    attribute_order: list[int] | None = None,
) -> list[tuple[int, ...]]:
    """Combine attribute axes into all variant value-id tuples.

    ``axes`` maps ``attribute_id`` → list of ``attribute_value_id``.
    Returns tuples ordered by ``attribute_order`` (default: sorted attribute ids).
    Empty axes dict returns [].
    """
    if not axes:
        return []
    order = attribute_order if attribute_order is not None else sorted(axes.keys())
    lists: list[list[int]] = []
    for attr_id in order:
        vals = axes.get(attr_id) or []
        if not vals:
            return []
        # preserve order but dedupe value ids per axis
        seen: set[int] = set()
        unique: list[int] = []
        for vid in vals:
            if vid not in seen:
                seen.add(vid)
                unique.append(vid)
        lists.append(unique)
    if not lists:
        return []
    return [tuple(combo) for combo in product(*lists)]
