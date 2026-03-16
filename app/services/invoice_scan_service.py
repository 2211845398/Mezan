"""Invoice scan OCR/QR pipeline (Epic 2)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.goods_receipt import GoodsReceipt
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.invoice_scan import InvoiceScan
from app.services.ocr.providers.base import ExtractedInvoice, OcrProvider
from app.services.ocr.providers.fake import FakeOcrProvider
from app.services.inventory_service import apply_stock_movement


def get_default_provider() -> OcrProvider:
    return FakeOcrProvider()


def parse_extracted_invoice(extracted: ExtractedInvoice) -> dict[str, Any]:
    # Stub parsing: create a normalized shell that the manual override UI can edit.
    return {
        "supplier_name": None,
        "invoice_number": None,
        "invoice_date": None,
        "line_items": [],
        "provider_payload": extracted.payload,
    }


async def create_scan(
    db: AsyncSession,
    *,
    source_type: str,
    data: str,
    provider: OcrProvider | None = None,
) -> InvoiceScan:
    if source_type not in {"qr", "image"}:
        raise ValidationError("Invalid source_type", details={"source_type": source_type})
    provider = provider or get_default_provider()
    scan = InvoiceScan(
        source_type=source_type,
        provider=provider.name,
        status="received",
        raw_input_ref={"source_type": source_type},
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
        # Movement is idempotent per (receipt,line-index)
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

    scan.status = "validated"
    await db.commit()
    await db.refresh(scan)
    await db.refresh(receipt)
    return scan, receipt

