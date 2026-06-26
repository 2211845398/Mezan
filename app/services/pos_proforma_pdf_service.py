"""Proforma invoice PDF export (Unicode / Arabic-safe, RTL layout)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fpdf import FPDF

from app.services.payroll_pdf_service import _register_unicode_font, _txt
from app.utils.request_locale import RequestLocale

ProformaLocale = RequestLocale

_LABELS: dict[ProformaLocale, dict[str, str]] = {
    "en": {
        "title": "Proforma invoice",
        "company": "Company",
        "branch": "Branch",
        "date": "Date / time",
        "document_no": "Document no.",
        "cashier": "Cashier",
        "logo": "LOGO",
        "col_product": "Product",
        "col_variant": "Variant",
        "col_qty": "Qty",
        "col_unit_price": "Unit price",
        "col_line_total": "Line total",
        "subtotal": "Subtotal",
        "tax": "Tax",
        "total": "Total",
        "none": "—",
    },
    "ar": {
        "title": "فاتورة مبدئية",
        "company": "الشركة",
        "branch": "الفرع",
        "date": "التاريخ والوقت",
        "document_no": "رقم المستند",
        "cashier": "أمين الصندوق",
        "logo": "الشعار",
        "col_product": "المنتج",
        "col_variant": "المتغير",
        "col_qty": "الكمية",
        "col_unit_price": "سعر الوحدة",
        "col_line_total": "إجمالي السطر",
        "subtotal": "المجموع الفرعي",
        "tax": "الضريبة",
        "total": "الإجمالي",
        "none": "—",
    },
}


def _labels(locale: ProformaLocale) -> dict[str, str]:
    return _LABELS.get(locale, _LABELS["ar"])


def _fmt_money(val: Decimal | str) -> str:
    d = Decimal(str(val))
    return f"{d:.2f}"


def _cell_align(rtl: bool) -> str:
    return "R" if rtl else "L"


def build_proforma_pdf_bytes(
    *,
    locale: ProformaLocale,
    company_name: str,
    branch_name: str | None,
    currency_code: str,
    document_number: str,
    cashier_name: str | None,
    lines: list[dict[str, str | int | Decimal]],
    subtotal: Decimal,
    tax_total: Decimal,
    total: Decimal,
) -> bytes:
    labels = _labels(locale)
    rtl = locale == "ar"
    align = _cell_align(rtl)

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    family = _register_unicode_font(pdf)

    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    logo_w, logo_h = 28.0, 18.0
    if rtl:
        logo_x = pdf.l_margin
    else:
        logo_x = pdf.w - pdf.r_margin - logo_w

    pdf.set_draw_color(180, 180, 180)
    pdf.rect(logo_x, pdf.get_y(), logo_w, logo_h)
    pdf.set_font(family, size=8)
    pdf.set_xy(logo_x, pdf.get_y() + logo_h / 2 - 2)
    pdf.cell(logo_w, 4, _txt(labels["logo"], 12), align="C")
    pdf.ln(logo_h + 2)

    pdf.set_font(family, size=14)
    pdf.cell(page_w, 8, _txt(labels["title"], 80), align=align, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(family, size=9)
    pdf.cell(
        page_w,
        5,
        _txt(f"{labels['company']}: {company_name}", 120),
        align=align,
        new_x="LMARGIN",
        new_y="NEXT",
    )
    if branch_name:
        pdf.cell(
            page_w,
            5,
            _txt(f"{labels['branch']}: {branch_name}", 120),
            align=align,
            new_x="LMARGIN",
            new_y="NEXT",
        )
    now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    pdf.cell(
        page_w,
        5,
        _txt(f"{labels['date']}: {now}", 80),
        align=align,
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(
        page_w,
        5,
        _txt(f"{labels['document_no']}: {document_number}", 80),
        align=align,
        new_x="LMARGIN",
        new_y="NEXT",
    )
    if cashier_name:
        pdf.cell(
            page_w,
            5,
            _txt(f"{labels['cashier']}: {cashier_name}", 80),
            align=align,
            new_x="LMARGIN",
            new_y="NEXT",
        )
    pdf.ln(3)

    col_w = [52, 38, 18, 28, 28]
    headers = [
        labels["col_product"],
        labels["col_variant"],
        labels["col_qty"],
        labels["col_unit_price"],
        labels["col_line_total"],
    ]
    if rtl:
        col_w = list(reversed(col_w))
        headers = list(reversed(headers))

    pdf.set_font(family, size=8)
    for w, h in zip(col_w, headers, strict=True):
        pdf.cell(w, 6, _txt(h, 28), border=1, align=align)
    pdf.ln()

    for row in lines:
        variant = str(row.get("variant_label") or "").strip() or labels["none"]
        cells = [
            str(row["product_name"]),
            variant,
            str(row["qty"]),
            _fmt_money(row["unit_price"]),
            _fmt_money(row["line_total"]),
        ]
        if rtl:
            cells = list(reversed(cells))
        pdf.set_font(family, size=8)
        max_lens = [30, 22, 8, 12, 12]
        if rtl:
            max_lens = list(reversed(max_lens))
        for val, w, max_len in zip(cells, col_w, max_lens, strict=True):
            pdf.cell(w, 5, _txt(val, max_len), border=1, align=align)
        pdf.ln()

    pdf.ln(2)
    summary_w = page_w * 0.55
    if rtl:
        pdf.set_x(pdf.l_margin)
    else:
        pdf.set_x(pdf.w - pdf.r_margin - summary_w)

    pdf.set_font(family, size=9)
    for label, amount in (
        (labels["subtotal"], subtotal),
        (labels["tax"], tax_total),
    ):
        pdf.cell(
            summary_w,
            5,
            _txt(f"{label}: {_fmt_money(amount)} {currency_code}", 60),
            align=align,
            new_x="LMARGIN",
            new_y="NEXT",
        )
        if not rtl:
            pdf.set_x(pdf.w - pdf.r_margin - summary_w)

    pdf.set_font(family, size=10)
    pdf.cell(
        summary_w,
        6,
        _txt(f"{labels['total']}: {_fmt_money(total)} {currency_code}", 60),
        align=align,
        new_x="LMARGIN",
        new_y="NEXT",
    )

    return bytes(pdf.output())
