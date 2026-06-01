"""Libyan national ID and IBAN validation for HR employee records."""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal

from app.core.errors import ValidationError

_NATIONAL_ID_RE = re.compile(r"^[12]\d{11}$")
_LIBYAN_IBAN_RE = re.compile(r"^LY\d{23}$")


def digits_only_national_id(raw: str) -> str:
    return re.sub(r"\D", "", raw or "")[:12]


def is_valid_libyan_national_id(raw: str) -> bool:
    digits = digits_only_national_id(raw)
    if not _NATIONAL_ID_RE.match(digits):
        return False
    year = int(digits[1:5])
    return 1900 <= year <= date.today().year


def normalize_libyan_iban(raw: str) -> str:
    return re.sub(r"\s", "", (raw or "")).upper()


def _iban_mod97(iban: str) -> bool:
    rearranged = iban[4:] + iban[:4]
    remainder = ""
    for ch in rearranged:
        expanded = str(ord(ch) - 55) if ch.isalpha() else ch
        remainder += expanded
        if len(remainder) > 9:
            remainder = str(int(remainder) % 97)
    return int(remainder) % 97 == 1


def is_valid_libyan_iban(raw: str) -> bool:
    iban = normalize_libyan_iban(raw)
    if not _LIBYAN_IBAN_RE.match(iban):
        return False
    return _iban_mod97(iban)


def validate_annual_leave_entitlement_days(value: Decimal | None) -> None:
    if value is None:
        return
    if value != value.to_integral_value():
        raise ValidationError(
            "annual_leave_entitlement_days must be a whole number",
            details={"annual_leave_entitlement_days": str(value)},
        )


def validate_employee_identity_and_bank(
    *,
    identity_document_type: str | None,
    identity_document_number: str | None,
    bank_account: str | None,
) -> None:
    doc_type = (identity_document_type or "").strip()
    doc_number = (identity_document_number or "").strip()
    if doc_type == "national_id" and doc_number and not is_valid_libyan_national_id(doc_number):
        raise ValidationError(
            "Invalid Libyan national ID number",
            details={"identity_document_number": doc_number},
        )
    bank = (bank_account or "").strip()
    if bank and not is_valid_libyan_iban(bank):
        raise ValidationError("Invalid Libyan IBAN", details={"bank_account": bank})
