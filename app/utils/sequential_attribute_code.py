"""Sequential ATTR_n / VAL_n codes for Arabic-only catalog attribute labels."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue

ATTR_CODE_RE = re.compile(r"^ATTR_(\d+)$", re.IGNORECASE)
VAL_CODE_RE = re.compile(r"^VAL_(\d+)$", re.IGNORECASE)
ARABIC_SCRIPT_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")


def has_arabic_script(text: str) -> bool:
    return bool(ARABIC_SCRIPT_RE.search(text or ""))


def _max_numeric_suffix(codes: list[str], pattern: re.Pattern[str]) -> int:
    max_n = 0
    for raw in codes:
        m = pattern.match((raw or "").strip())
        if m:
            max_n = max(max_n, int(m.group(1)))
    return max_n


async def next_catalog_attribute_code(db: AsyncSession) -> str:
    res = await db.execute(select(CatalogAttribute.code))
    codes = [row[0] for row in res.all()]
    return f"ATTR_{_max_numeric_suffix(codes, ATTR_CODE_RE) + 1}"


async def next_catalog_attribute_value_code(db: AsyncSession, attribute_id: int) -> str:
    res = await db.execute(
        select(CatalogAttributeValue.code).where(CatalogAttributeValue.attribute_id == attribute_id)
    )
    codes = [row[0] for row in res.all()]
    return f"VAL_{_max_numeric_suffix(codes, VAL_CODE_RE) + 1}"
