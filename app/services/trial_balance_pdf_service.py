"""PDF export for trial balance (Unicode / Arabic-safe)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fpdf import FPDF

from app.services.payroll_pdf_service import _register_unicode_font, _txt


def build_trial_balance_pdf(
    *,
    as_of: date,
    branch_name: str | None,
    rows: list[dict],
    totals: dict[str, Decimal],
    title: str = "Trial balance",
) -> bytes:
    """Build a landscape PDF table for trial balance as of a date."""
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()
    family = _register_unicode_font(pdf)

    pdf.set_font(family, size=12)
    pdf.cell(0, 8, _txt(title, 120), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(family, size=8)
    pdf.cell(0, 5, _txt(f"As of: {as_of.isoformat()}", 80), new_x="LMARGIN", new_y="NEXT")
    if branch_name:
        pdf.cell(0, 5, _txt(f"Branch: {branch_name}", 80), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    headers = ["Code", "Name", "Type", "Debit", "Credit", "Net"]
    col_w = [22, 70, 28, 28, 28, 28]

    pdf.set_font(family, size=7)
    for h, w in zip(headers, col_w, strict=True):
        pdf.cell(w, 6, _txt(h, 24), border=1)
    pdf.ln()

    for r in rows:
        dr = r.get("total_debit", 0)
        cr = r.get("total_credit", 0)
        net = r.get("net", 0)
        line = [
            r.get("code", ""),
            r.get("name", ""),
            r.get("account_type", ""),
            str(dr) if Decimal(str(dr)) != 0 else "",
            str(cr) if Decimal(str(cr)) != 0 else "",
            str(net),
        ]
        for val, w in zip(line, col_w, strict=True):
            pdf.cell(w, 5, _txt(val, 48), border=1)
        pdf.ln()

    pdf.set_font(family, size=7)
    pdf.cell(col_w[0] + col_w[1] + col_w[2], 6, _txt("Totals", 24), border=1)
    pdf.cell(col_w[3], 6, _txt(str(totals.get("debit", 0)), 20), border=1)
    pdf.cell(col_w[4], 6, _txt(str(totals.get("credit", 0)), 20), border=1)
    pdf.cell(col_w[5], 6, _txt(str(totals.get("net", 0)), 20), border=1)

    return bytes(pdf.output())
