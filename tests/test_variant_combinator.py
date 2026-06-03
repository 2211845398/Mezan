"""Unit tests for variant Cartesian combinator."""

from app.utils.variant_combinator import cartesian_product_combos


def test_cartesian_two_axes() -> None:
    axes = {1: [10, 11], 2: [20, 21, 22]}
    combos = cartesian_product_combos(axes, attribute_order=[1, 2])
    assert len(combos) == 6
    assert (10, 20) in combos
    assert (11, 22) in combos


def test_cartesian_single_axis() -> None:
    combos = cartesian_product_combos({5: [1, 2, 3]}, attribute_order=[5])
    assert combos == [(1,), (2,), (3,)]


def test_cartesian_empty_axes() -> None:
    assert cartesian_product_combos({}) == []


def test_cartesian_dedupes_value_ids() -> None:
    combos = cartesian_product_combos({1: [10, 10, 11]}, attribute_order=[1])
    assert combos == [(10,), (11,)]
