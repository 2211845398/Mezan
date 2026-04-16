"""Invoice scan OCR/QR pipeline (Epic 2)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import NotFoundError, ValidationError
from app.models.goods_receipt import GoodsReceipt
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.invoice_scan import InvoiceScan
from app.models.stock_level import StockLevel
from app.services.document_posting_service import post_goods_receipt_gl
from app.services.inventory_service import apply_stock_movement
from app.services.inventory_valuation_service import apply_receipt_to_weighted_average
from app.services.ocr.providers.base import ExtractedInvoice, OcrProvider
from app.services.ocr.providers.basic import BasicOcrProvider
from app.services.ocr.providers.fake import FakeOcrProvider


def get_provider(provider_name: str | None = None) -> OcrProvider:
    selected = (provider_name or settings.OCR_PROVIDER).lower()
    if selected == "fake":
        return FakeOcrProvider()
    if selected == "basic":
        return BasicOcrProvider()
    raise ValidationError("Unsupported OCR provider", details={"provider": selected})


def _get_first_str(data: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _to_int(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def parse_extracted_invoice(extracted: ExtractedInvoice) -> dict[str, Any]:
    payload = extracted.payload if isinstance(extracted.payload, dict) else {}
    structured = payload.get("structured")
    if not isinstance(structured, dict):
        structured = {}

    supplier_name = _get_first_str(
        structured,
        ["supplier_name", "supplier", "vendor_name", "vendor"],
    )
    invoice_number = _get_first_str(
        structured,
        ["invoice_number", "invoice_no", "invoice", "inv_no"],
    )
    invoice_date = _get_first_str(
        structured,
        ["invoice_date", "date", "document_date"],
    )
    currency = _get_first_str(structured, ["currency", "currency_code"]) or "USD"

    raw_items = structured.get("line_items")
    if not isinstance(raw_items, list):
        raw_items = []

    line_items: list[dict[str, Any]] = []
    running_total = Decimal("0")
    for idx, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        product_id = _to_int(item.get("product_id"))
        qty = _to_int(item.get("qty") or item.get("quantity"))
        unit_cost = _to_float(item.get("unit_cost") or item.get("price") or item.get("cost"))
        if qty and unit_cost:
            running_total += Decimal(str(qty)) * Decimal(str(unit_cost))
        line_items.append(
            {
                "line_no": idx + 1,
                "product_id": product_id,
                "qty": qty,
                "unit_cost": unit_cost,
                "description": item.get("description"),
            }
        )

    tax = _to_float(structured.get("tax"))
    total = _to_float(structured.get("total"))
    subtotal = _to_float(structured.get("subtotal"))

    if subtotal is None:
        subtotal = float(running_total)
    if total is None:
        total = subtotal + (tax or 0.0)

    return {
        "supplier_name": supplier_name,
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "currency": currency,
        "line_items": line_items,
        "subtotal": subtotal,
        "tax": tax or 0.0,
        "total": total,
        "provider_payload": payload,
    }


async def create_scan(
    db: AsyncSession,
    *,
    source_type: str,
    data: str,
    provider_name: str | None = None,
) -> InvoiceScan:
    if source_type not in {"qr", "image"}:
        raise ValidationError("Invalid source_type", details={"source_type": source_type})
    provider = get_provider(provider_name)
    scan = InvoiceScan(
        source_type=source_type,
        provider=provider.name,
        status="received",
        raw_input_ref={"source_type": source_type, "data_length": len(data)},
    )
    db.add(scan)
    await db.flush()

    extracted = await provider.extract_invoice(source_type=source_type, data=data)
    scan.raw_output = extracted.payload
    scan.parsed_output = parse_extracted_invoice(extracted)
    scan.status = "needs_review"

    await db.commit()
    await db.refresh(scan)
    return scan


async def get_scan(db: AsyncSession, scan_id: int) -> InvoiceScan:
    result = await db.execute(select(InvoiceScan).where(InvoiceScan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise NotFoundError("Invoice scan not found", details={"scan_id": scan_id})
    return scan


async def override_scan(
    db: AsyncSession,
    *,
    scan_id: int,
    override_output: dict[str, Any],
) -> InvoiceScan:
    scan = await get_scan(db, scan_id)
    scan.override_output = override_output
    scan.status = "needs_review"
    await db.commit()
    await db.refresh(scan)
    return scan


async def validate_scan_and_receive_goods(
    db: AsyncSession,
    *,
    scan_id: int,
    branch_id: int,
    created_by_user_id: int | None,
) -> tuple[InvoiceScan, GoodsReceipt]:
    scan = await get_scan(db, scan_id)
    if scan.status == "validated":
        raise ValidationError("Scan already validated", details={"scan_id": scan_id})

    payload = scan.override_output or scan.parsed_output
    if not isinstance(payload, dict):
        raise ValidationError("Scan has no parsed data", details={"scan_id": scan_id})

    line_items = payload.get("line_items") or []
    if not isinstance(line_items, list) or not line_items:
        raise ValidationError("No line items to receive", details={"scan_id": scan_id})

    receipt = GoodsReceipt(
        branch_id=branch_id,
        supplier_name=payload.get("supplier_name"),
        invoice_number=payload.get("invoice_number"),
        source_invoice_scan_id=scan.id,
        created_by_user_id=created_by_user_id,
    )
    db.add(receipt)
    await db.flush()

    for i, item in enumerate(line_items):
        if not isinstance(item, dict):
            raise ValidationError("Invalid line item", details={"index": i})
        product_id = item.get("product_id")
        qty = item.get("qty")
        unit_cost = item.get("unit_cost")
        if not isinstance(product_id, int) or not isinstance(qty, int) or qty <= 0:
            raise ValidationError(
                "Line item must include product_id(int) and qty(int>0)",
                details={"index": i},
            )
        if not isinstance(unit_cost, (int, float)) or unit_cost <= 0:
            raise ValidationError(
                "Line item must include unit_cost(number>0)",
                details={"index": i},
            )
        db.add(
            GoodsReceiptLine(
                goods_receipt_id=receipt.id,
                product_id=product_id,
                qty=qty,
                unit_cost=float(unit_cost),
            )
        )
        sl_res = await db.execute(
            select(StockLevel.on_hand).where(
                and_(StockLevel.branch_id == branch_id, StockLevel.product_id == product_id)
            )
        )
        qty_on_hand_before = int(sl_res.scalar_one_or_none() or 0)
        await apply_stock_movement(
            db,
            idempotency_key=f"goods_receipt:{receipt.id}:line:{i}",
            branch_id=branch_id,
            product_id=product_id,
            qty_delta=qty,
            reason="goods_receipt",
            ref_type="goods_receipt",
            ref_id=str(receipt.id),
        )
        await apply_receipt_to_weighted_average(
            db,
            branch_id=branch_id,
            product_id=product_id,
            qty_in=qty,
            unit_cost=Decimal(str(unit_cost)),
            qty_on_hand_before=qty_on_hand_before,
        )

    await post_goods_receipt_gl(db, receipt=receipt)
    scan.status = "validated"
    await db.commit()
    await db.refresh(scan)
    await db.refresh(receipt)
    return scan, receipt
