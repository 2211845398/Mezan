"""Unit tests for Smart SKU helpers."""

import pytest

from app.utils.attribute_code import normalize_attribute_code
from app.utils.smart_sku import (
    SKU_SEGMENT_MAX,
    category_slug_to_prefix,
    format_product_sku,
    format_variant_sku,
    is_auto_generated_value_code,
    sku_segment_key,
    validate_sku_reference,
)


def test_category_slug_to_prefix_beverages() -> None:
    assert category_slug_to_prefix("beverages") == "BEV"


def test_category_slug_to_prefix_short_slug() -> None:
    assert category_slug_to_prefix("ric") == "RIC"


def test_category_slug_to_prefix_no_ascii() -> None:
    prefix = category_slug_to_prefix("ملابس-صيفية")
    assert len(prefix) == 3
    assert prefix.isalnum()


def test_format_product_sku() -> None:
    assert format_product_sku("BEV", 10) == "BEV-010"
    assert format_product_sku("BEV", 1000) == "BEV-1000"


def test_format_variant_sku() -> None:
    assert format_variant_sku("BEV-010", ["red", "1m"]) == "BEV-010-RED-1M"


def test_validate_sku_reference_accepts_hyphens() -> None:
    assert validate_sku_reference("prd-010-red-1m") == "PRD-010-RED-1M"


def test_validate_sku_reference_rejects_arabic() -> None:
    with pytest.raises(ValueError):
        validate_sku_reference("PRD-احمر")


def test_validate_sku_reference_rejects_spaces() -> None:
    with pytest.raises(ValueError):
        validate_sku_reference("PRD 010")


def test_normalize_attribute_code_strips_arabic() -> None:
    code = normalize_attribute_code("أحمر")
    assert is_auto_generated_value_code(code)


def test_normalize_attribute_code_keeps_english() -> None:
    assert normalize_attribute_code("Red") == "RED"
    assert normalize_attribute_code("1M") == "1M"


def test_sku_segment_max_is_five() -> None:
    assert SKU_SEGMENT_MAX == 5


def test_sku_segment_key_black_vs_blackberry() -> None:
    assert sku_segment_key("BLACK") == "BLACK"
    assert sku_segment_key("BLACKBERRY") == "BLACK"


def test_sku_segment_key_distinct_colors() -> None:
    assert sku_segment_key("RED") != sku_segment_key("BLUE")
