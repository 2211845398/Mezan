"""Journal source reference resolution."""

from app.services.journal_source_reference import _is_opaque_source_id

_OPAQUE_VOUCHER_SOURCE_ID = "00405381-06a4-4492-886a-d2d36c06abcd"


def test_manual_source_id_is_opaque() -> None:
    assert _is_opaque_source_id("manual", _OPAQUE_VOUCHER_SOURCE_ID) is True


def test_sales_invoice_numeric_not_opaque() -> None:
    assert _is_opaque_source_id("sales_invoice", "42") is False


def test_uuid_is_opaque_for_voucher() -> None:
    assert (
        _is_opaque_source_id(
            "voucher_payment",
            _OPAQUE_VOUCHER_SOURCE_ID,
        )
        is True
    )
