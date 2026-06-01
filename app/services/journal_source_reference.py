"""Resolve journal entry source_id to a human-readable reference for UI."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goods_receipt import GoodsReceipt
from app.models.bom import ProductionOrder
from app.models.sales_invoice import SalesInvoice

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_HEX32_RE = re.compile(r"^[0-9a-f]{32}$", re.IGNORECASE)


def _is_opaque_source_id(source_type: str, source_id: str) -> bool:
    """True when source_id is internal-only (UUID, idempotency key) — hide in UI."""
    s = source_id.strip()
    if not s or source_type == "manual":
        return True
    if _UUID_RE.match(s) or _HEX32_RE.match(s):
        return True
    if source_type.startswith("voucher_") or source_type == "opening_balance":
        return _UUID_RE.match(s) or _HEX32_RE.match(s) or len(s) > 64
    return False


def _parse_int_prefix(source_id: str) -> int | None:
    part = source_id.strip().split(":", 1)[0]
    try:
        return int(part)
    except ValueError:
        return None


async def resolve_journal_source_reference(
    db: AsyncSession,
    *,
    source_type: str,
    source_id: str,
) -> str | None:
    """Return a display label for the source document, or None to hide the field."""
    sid = (source_id or "").strip()
    if not sid:
        return None

    if source_type in ("opening_balance",) or source_type.startswith("voucher_"):
        if not _is_opaque_source_id(source_type, sid):
            return sid
        return None

    if _is_opaque_source_id(source_type, sid):
        return None

    if source_type == "journal_reversal":
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    if source_type == "sales_invoice":
        oid = _parse_int_prefix(sid)
        if oid is None:
            return None
        res = await db.execute(
            select(SalesInvoice.invoice_number).where(SalesInvoice.id == oid)
        )
        row = res.first()
        return str(row[0]) if row else f"#{oid}"

    if source_type in ("goods_receipt", "purchase_receipt"):
        oid = _parse_int_prefix(sid)
        if oid is None:
            return None
        res = await db.execute(select(GoodsReceipt).where(GoodsReceipt.id == oid))
        gr = res.scalar_one_or_none()
        if gr and gr.invoice_number:
            return gr.invoice_number.strip()
        if gr and gr.purchase_order_id:
            return f"PO-{gr.purchase_order_id}"
        return f"GR-{oid}"

    if source_type in ("transfer", "transfer_batch"):
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    if source_type == "sales_return":
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    if source_type in ("ar_payment_application", "ap_payment_application"):
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    if source_type in ("payslip", "payroll"):
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    if source_type == "pos_shift":
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    if source_type == "production_order":
        oid = _parse_int_prefix(sid)
        if oid is None:
            return None
        res = await db.execute(
            select(ProductionOrder.order_number).where(ProductionOrder.id == oid)
        )
        row = res.first()
        return str(row[0]) if row else f"#{oid}"

    if source_type == "loyalty_ledger":
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    if source_type == "fx_revaluation":
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    if source_type in ("stock_adjustment", "inventory_adjustment"):
        oid = _parse_int_prefix(sid)
        return f"#{oid}" if oid is not None else None

    # Short opaque-safe fallback for numeric ids
    if sid.isdigit():
        return f"#{sid}"

    if len(sid) <= 48 and not _UUID_RE.match(sid):
        return sid

    return None
