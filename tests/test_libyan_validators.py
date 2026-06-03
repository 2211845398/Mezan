"""Libyan national ID and IBAN validators."""

from decimal import Decimal

import pytest

from app.core.errors import ValidationError
from app.utils.libyan_validators import (
    is_valid_libyan_iban,
    is_valid_libyan_national_id,
    validate_annual_leave_entitlement_days,
    validate_employee_identity_and_bank,
)


def test_national_id_valid() -> None:
    assert is_valid_libyan_national_id("220030369666") is True


def test_national_id_invalid_gender() -> None:
    assert is_valid_libyan_national_id("320030369666") is False


def test_employee_identity_national_id_enforced() -> None:
    with pytest.raises(ValidationError):
        validate_employee_identity_and_bank(
            identity_document_type="national_id",
            identity_document_number="999999999999",
            bank_account=None,
        )


def test_annual_leave_must_be_whole() -> None:
    with pytest.raises(ValidationError):
        validate_annual_leave_entitlement_days(Decimal("21.5"))


def test_iban_rejects_short_value() -> None:
    assert is_valid_libyan_iban("LY123") is False
