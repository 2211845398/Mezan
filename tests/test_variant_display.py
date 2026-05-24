"""Variant display helpers for purchasing pickers."""

from app.utils.variant_display import (
    format_purchasing_variant_option,
    variant_attributes_summary,
    variant_value_labels_summary,
)


def test_variant_value_labels_summary_human_only() -> None:
    assert variant_value_labels_summary({"COLOR": "أحمر", "SIZE": "M"}) == "أحمر · M"
    assert variant_value_labels_summary({"_default": True}) == ""
    assert variant_value_labels_summary(None) == ""


def test_variant_attributes_summary_includes_codes() -> None:
    assert "COLOR:" in variant_attributes_summary({"COLOR": "أحمر"})


def test_format_purchasing_variant_option() -> None:
    assert (
        format_purchasing_variant_option(
            display_name="دولاب صيني",
            sku="CAT-001",
            barcode="201000001059",
            attribute_values={"LEN": "10 متر"},
        )
        == "[201000001059] دولاب صيني — 10 متر"
    )
    assert (
        format_purchasing_variant_option(
            display_name="Simple",
            sku="SKU-1",
            barcode=None,
            attribute_values=None,
        )
        == "[SKU-1] Simple"
    )
