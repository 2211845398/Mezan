"""Purchase order PDF for supplier email (Unicode / Arabic-safe)."""

from __future__ import annotations

from datetime import UTC, datetime

from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.purchase_order import PurchaseOrder
from app.services.payroll_pdf_service import _register_unicode_font, _txt
from app.services.purchase_order_service import purchase_order_to_read_one
from app.utils.request_locale import RequestLocale

PoPdfLocale = RequestLocale

_LABELS: dict[PoPdfLocale, dict[str, str]] = {
    "en": {
        "title": "Purchase order",
        "company": "Company",
        "branch": "Delivery branch",
        "po_number": "PO #",
        "created": "Created",
        "supplier": "Supplier",
        "expected": "Expected delivery",
        "notes": "Notes",
        "col_product": "Product",
        "col_variant": "Variant",
        "col_qty": "Qty",
        "col_uom": "Unit",
        "none": "—",
    },
    "ar": {
        "title": "أمر شراء",
        "company": "الشركة",
        "branch": "فرع التسليم",
        "po_number": "رقم الأمر",
        "created": "تاريخ الإنشاء",
        "supplier": "المورد",
        "expected": "التسليم المتوقع",
        "notes": "ملاحظات",
        "col_product": "المنتج",
        "col_variant": "المتغير",
        "col_qty": "الكمية",
        "col_uom": "الوحدة",
        "none": "—",
    },
}


def _labels(locale: PoPdfLocale) -> dict[str, str]:
    return _LABELS.get(locale, _LABELS["ar"])


def _variant_label(variant: ProductVariant | None) -> str:
    if variant is None:
        return ""
    attrs = variant.attribute_values or {}
    if attrs:
        parts = [f"{k}: {v}" for k, v in sorted(attrs.items(), key=lambda x: str(x[0]))]
        if parts:
            return ", ".join(str(p) for p in parts)
    return variant.sku


def _fmt_dt(val: datetime | None) -> str:
    if val is None:
        return ""
    if val.tzinfo is None:
        val = val.replace(tzinfo=UTC)
    return val.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


async def _line_rows_for_pdf(db: AsyncSession, po: PurchaseOrder) -> list[dict[str, str | int]]:
    product_ids = {int(ln.product_id) for ln in po.lines}
    variant_ids = {int(ln.variant_id) for ln in po.lines if ln.variant_id is not None}

    products: dict[int, Product] = {}
    if product_ids:
        res = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        products = {int(p.id): p for p in res.scalars().all()}

    variants: dict[int, ProductVariant] = {}
    if variant_ids:
        res = await db.execute(select(ProductVariant).where(ProductVariant.id.in_(variant_ids)))
        variants = {int(v.id): v for v in res.scalars().all()}

    po_read = await purchase_order_to_read_one(db, po)
    uom_by_line = {ln.id: ln for ln in po_read.lines}

    rows: list[dict[str, str | int]] = []
    for ln in po.lines:
        product = products.get(int(ln.product_id))
        variant = variants.get(int(ln.variant_id)) if ln.variant_id is not None else None
        read_ln = uom_by_line.get(ln.id)
        uom_label = ""
        if read_ln is not None:
            uom_label = read_ln.uom_symbol or read_ln.uom_name or ""
        rows.append(
            {
                "product_name": product.name if product else str(ln.product_id),
                "variant_name": _variant_label(variant),
                "qty": int(ln.qty),
                "uom_label": uom_label,
            }
        )
    return rows


def _build_pdf_bytes(
    *,
    locale: PoPdfLocale,
    company_name: str,
    branch_name: str | None,
    po_id: int,
    supplier_name: str,
    created_at: datetime,
    expected_at: datetime | None,
    notes: str | None,
    line_rows: list[dict[str, str | int]],
) -> bytes:
    labels = _labels(locale)
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    family = _register_unicode_font(pdf)

    pdf.set_font(family, size=14)
    pdf.cell(0, 8, _txt(labels["title"], 80), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(family, size=9)
    pdf.cell(0, 5, _txt(f"{labels['company']}: {company_name}", 120), new_x="LMARGIN", new_y="NEXT")
    if branch_name:
        pdf.cell(
            0, 5, _txt(f"{labels['branch']}: {branch_name}", 120), new_x="LMARGIN", new_y="NEXT"
        )
    pdf.cell(
        0,
        5,
        _txt(f"{labels['po_number']}{po_id}", 80),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(
        0,
        5,
        _txt(f"{labels['created']}: {_fmt_dt(created_at)}", 80),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(
        0, 5, _txt(f"{labels['supplier']}: {supplier_name}", 120), new_x="LMARGIN", new_y="NEXT"
    )
    if expected_at is not None:
        pdf.cell(
            0,
            5,
            _txt(f"{labels['expected']}: {_fmt_dt(expected_at)}", 80),
            new_x="LMARGIN",
            new_y="NEXT",
        )
    if notes and notes.strip():
        pdf.cell(
            0, 5, _txt(f"{labels['notes']}: {notes.strip()}", 200), new_x="LMARGIN", new_y="NEXT"
        )
    pdf.ln(3)

    headers = [labels["col_product"], labels["col_variant"], labels["col_qty"], labels["col_uom"]]
    widths = [70, 55, 22, 35]
    pdf.set_font(family, size=8)
    for w, h in zip(widths, headers, strict=True):
        pdf.cell(w, 6, _txt(h, 32), border=1)
    pdf.ln()

    for row in line_rows:
        variant_name = str(row.get("variant_name") or "").strip() or labels["none"]
        vals = [
            row.get("product_name", ""),
            variant_name,
            str(row.get("qty", "")),
            row.get("uom_label") or labels["none"],
        ]
        for w, val in zip(widths, vals, strict=True):
            pdf.cell(w, 6, _txt(val, 56), border=1)
        pdf.ln()

    raw = pdf.output()
    if isinstance(raw, str):
        return raw.encode("latin-1")
    return bytes(raw)


async def build_purchase_order_pdf_bytes(
    db: AsyncSession,
    po: PurchaseOrder,
    *,
    locale: PoPdfLocale = "ar",
    company_name: str | None = None,
) -> tuple[bytes, str]:
    """Build PO PDF bytes and a safe attachment filename."""
    po_read = await purchase_order_to_read_one(db, po)
    line_rows = await _line_rows_for_pdf(db, po)
    company = (company_name or "").strip() or settings.COMPANY_DISPLAY_NAME
    pdf_bytes = _build_pdf_bytes(
        locale=locale,
        company_name=company,
        branch_name=po_read.branch_name,
        po_id=po.id,
        supplier_name=po.supplier_name,
        created_at=po.created_at,
        expected_at=po.expected_at,
        notes=po.notes,
        line_rows=line_rows,
    )
    filename = f"purchase-order-{po.id}.pdf"
    return pdf_bytes, filename
