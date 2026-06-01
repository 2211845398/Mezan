"""PDF and CSV export for payroll period tables (Unicode / Arabic-safe)."""

from __future__ import annotations

import csv
import io
import os
import re
from datetime import date, datetime
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF

# app/services/payroll_pdf_service.py -> parents[1] == app/
_APP_DIR = Path(__file__).resolve().parents[1]
_STATIC_FONTS = _APP_DIR / "static" / "fonts"


def _has_arabic(s: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]", s))


def _visual_text(s: str) -> str:
    """Reshape + bidi so Arabic renders correctly in LTR PDF cells."""
    if not s or not _has_arabic(s):
        return s
    reshaped = arabic_reshaper.reshape(s)
    return get_display(reshaped)


def _candidate_unicode_font_paths() -> list[Path]:
    """Ordered search list. fpdf2 wheels no longer ship DejaVu; prefer project/env/OS fonts."""
    out: list[Path] = []
    seen: set[str] = set()

    def push(p: Path) -> None:
        try:
            key = str(p.resolve(strict=False))
        except OSError:
            key = str(p)
        if key not in seen:
            seen.add(key)
            out.append(p)

    env = os.environ.get("PAYROLL_PDF_FONT_PATH", "").strip()
    if env:
        push(Path(env))

    for rel in ("DejaVuSans.ttf", "Cairo-Regular.ttf", "NotoSansArabic-Regular.ttf"):
        push(_STATIC_FONTS / rel)

    # Debian/Ubuntu packages: fonts-dejavu-core
    for sys_path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/local/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        push(Path(sys_path))

    windir = os.environ.get("WINDIR", "")
    if windir:
        push(Path(windir) / "Fonts" / "DejaVuSans.ttf")

    try:
        import fpdf as fpdf_pkg

        pkg_root = Path(fpdf_pkg.__file__).resolve().parent
        for found in sorted({p for p in pkg_root.rglob("DejaVuSans.ttf") if p.is_file()}):
            push(found)
    except OSError:
        pass

    return out


def _register_unicode_font(pdf: FPDF) -> str:
    """Register a TTF that supports Arabic (and Latin)."""
    for path in _candidate_unicode_font_paths():
        if path.is_file():
            pdf.add_font("PayrollUnicode", "", str(path))
            return "PayrollUnicode"
    msg = (
        "No Unicode font found for payroll PDF. Options: (1) install fonts-dejavu-core in the "
        "container/OS, (2) set PAYROLL_PDF_FONT_PATH to a .ttf file, (3) place DejaVuSans.ttf "
        "(or Cairo / Noto Arabic) under app/static/fonts/."
    )
    raise RuntimeError(msg)


def _txt(val: object, max_len: int = 32) -> str:
    if val is None:
        return ""
    s = str(val).replace("\r", " ").replace("\n", " ")
    if len(s) > max_len:
        s = s[: max_len - 1] + "..."
    return _visual_text(s)


def _fmt_paid(val: object) -> str:
    if val is None or val == "":
        return ""
    s = str(val)
    if "T" in s:
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00")).date()
            return f"{d.day:02d}-{d.month:02d}-{d.year}"
        except ValueError:
            pass
    return _txt(s, 40)


def build_payroll_period_pdf(
    *,
    period_start: date,
    period_end: date,
    rows: list[dict],
    title: str = "Payroll report",
) -> bytes:
    """Build a landscape PDF table for one payroll period."""
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()
    family = _register_unicode_font(pdf)

    pdf.set_font(family, size=12)
    pdf.cell(0, 8, _txt(title, 120), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(family, size=8)
    pdf.cell(
        0,
        5,
        _txt(f"Period: {period_start.isoformat()} - {period_end.isoformat()}", 120),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(2)

    headers = [
        "Employee",
        "Role",
        "Base",
        "Hourly",
        "Gross",
        "Auto ded.",
        "Manual ded.",
        "Bonus",
        "OT",
        "Net",
        "Status",
        "Paid",
    ]
    col_w = [38, 22, 18, 18, 18, 18, 18, 16, 16, 20, 22, 28]

    pdf.set_font(family, size=7)
    for h, w in zip(headers, col_w, strict=True):
        pdf.cell(w, 6, _txt(h, 24), border=1)
    pdf.ln()

    for r in rows:
        name = r.get("user_full_name") or r.get("user_email") or str(r["employee_profile_id"])
        line = [
            name,
            r.get("user_role_code"),
            r.get("base_salary"),
            r.get("hourly_rate"),
            r.get("gross_amount"),
            r.get("automatic_deductions_amount"),
            r.get("manual_deductions_amount"),
            r.get("bonus_amount"),
            r.get("overtime_amount"),
            r.get("net_amount"),
            r.get("payslip_status"),
            _fmt_paid(r.get("paid_at")),
        ]
        for val, w in zip(line, col_w, strict=True):
            pdf.cell(w, 6, _txt(val, 48), border=1)
        pdf.ln()

    raw = pdf.output()
    if isinstance(raw, str):
        return raw.encode("latin-1")
    # fpdf2 may return bytearray; Starlette Response expects str or bytes, not bytearray.
    return bytes(raw)


def _csv_cell(val: object) -> str:
    if val is None:
        return ""
    return str(val)


def build_payroll_period_csv(
    *,
    period_start: date,
    period_end: date,
    rows: list[dict],
) -> str:
    """UTF-8 BOM CSV for one payroll period (opens in Excel)."""
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Employee",
            "Role",
            "Base salary",
            "Hourly rate",
            "Gross",
            "Auto deductions",
            "Manual deductions",
            "Bonus",
            "Overtime",
            "Net",
            "Status",
            "Paid at",
            "Period start",
            "Period end",
        ]
    )
    for r in rows:
        name = r.get("user_full_name") or r.get("user_email") or str(r.get("employee_profile_id", ""))
        writer.writerow(
            [
                name,
                _csv_cell(r.get("user_role_code")),
                _csv_cell(r.get("base_salary")),
                _csv_cell(r.get("hourly_rate")),
                _csv_cell(r.get("gross_amount")),
                _csv_cell(r.get("automatic_deductions_amount")),
                _csv_cell(r.get("manual_deductions_amount")),
                _csv_cell(r.get("bonus_amount")),
                _csv_cell(r.get("overtime_amount")),
                _csv_cell(r.get("net_amount")),
                _csv_cell(r.get("payslip_status")),
                _csv_cell(r.get("paid_at")),
                period_start.isoformat(),
                period_end.isoformat(),
            ]
        )
    return buf.getvalue()
