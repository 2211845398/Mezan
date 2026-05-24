"""Smart SKU formatting: ASCII-only reference codes for products and variants."""

from __future__ import annotations

import hashlib
import re

SKU_MAX_LEN = 128
SKU_SEGMENT_MAX = 5
SKU_REFERENCE_RE = re.compile(r"^[A-Z0-9]+(-[A-Z0-9]+)*$")
AUTO_VALUE_CODE_RE = re.compile(r"^V[A-F0-9]{12}$")


def category_slug_to_prefix(slug: str, *, max_len: int = 3) -> str:
    """Derive a short ASCII prefix from a category slug (e.g. beverages -> BEV)."""
    raw = (slug or "").strip().lower()
    if not raw:
        return "PRD"

    tokens = [t for t in re.split(r"[-_\s]+", raw) if t]
    letters = "".join(ch for t in tokens for ch in t if "a" <= ch <= "z")

    if len(letters) >= max_len:
        return letters[:max_len].upper()

    if letters:
        return letters.upper().ljust(max_len, "X")[:max_len]

    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:max_len]
    return digest.upper()


def _product_id_width(product_id: int) -> int:
    return 4 if product_id >= 1000 else 3


def format_product_sku(prefix: str, product_id: int) -> str:
    """Build template-level SKU: ``{PREFIX}-{id}`` (e.g. BEV-010)."""
    pfx = normalize_sku_segment(prefix, max_len=4) or "PRD"
    width = _product_id_width(product_id)
    return f"{pfx}-{product_id:0{width}d}"


def normalize_sku_segment(raw: str, *, max_len: int = SKU_SEGMENT_MAX) -> str:
    """Uppercase ASCII alphanumeric segment for SKU parts."""
    s = (raw or "").strip().upper()
    cleaned = re.sub(r"[^A-Z0-9]", "", s)
    return cleaned[:max_len] if cleaned else ""


def sku_segment_key(code: str, *, max_len: int = SKU_SEGMENT_MAX) -> str:
    """Stable SKU segment key used for collision checks within an attribute axis."""
    return normalize_sku_segment(code, max_len=max_len)


def format_variant_sku(
    product_sku: str,
    value_codes: list[str],
    *,
    segment_max: int = SKU_SEGMENT_MAX,
) -> str:
    """Append attribute value codes to product SKU (e.g. BEV-010-RED-1M)."""
    base = (product_sku or "").strip().upper()
    parts = [base] if base else []
    for code in value_codes:
        seg = normalize_sku_segment(code, max_len=segment_max)
        if seg:
            parts.append(seg)
    return "-".join(parts)


def validate_sku_reference(sku: str) -> str:
    """
    Normalize and validate a reference SKU string.

    Raises ValueError if invalid.
    """
    normalized = (sku or "").strip().upper()
    if not normalized or len(normalized) > SKU_MAX_LEN:
        raise ValueError("SKU must be 1–128 ASCII segments separated by hyphens")
    if not SKU_REFERENCE_RE.match(normalized):
        raise ValueError("SKU must use English letters, numbers, and hyphens only")
    return normalized


def is_auto_generated_value_code(code: str) -> bool:
    """True when code came from Arabic-only label fallback (not SKU-safe)."""
    return bool(AUTO_VALUE_CODE_RE.match((code or "").strip().upper()))
