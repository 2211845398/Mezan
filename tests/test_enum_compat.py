"""Enum compat: legacy uppercase DB values map to PEP-435 members."""

from app.db.enum_compat import coerce_pep435_enum
from app.models.chart_accounts import AccountType


def test_coerce_uppercase_db_asset() -> None:
    assert coerce_pep435_enum(AccountType, "ASSET") is AccountType.ASSET
    assert coerce_pep435_enum(AccountType, "ASSET").value == "asset"


def test_coerce_lowercase_value() -> None:
    assert coerce_pep435_enum(AccountType, "liability") is AccountType.LIABILITY
