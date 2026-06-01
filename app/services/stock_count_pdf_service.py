"""Stock count sheet PDF (blank columns for manual entry)."""

from __future__ import annotations

from datetime import UTC, datetime
from fpdf import FPDF
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.services.catalog_service import _category_descendant_ids
from app.services.inventory_reporting_service import list_stock_on_hand
from app.services.payroll_pdf_service import _register_unicode_font, _txt
from app.utils.request_locale import RequestLocale

StockCountLocale = RequestLocale

_LABELS: dict[StockCountLocale, dict[str, str]] = {
    "en": {
        "title": "Stock count sheet — {branch}",
        "date": "Generated: {datetime}",
        "responsible": "Responsible: {name}",
        "col_product": "Product",
        "col_variant": "Variant",
        "col_reference": "User reference",
        "col_on_hand": "On hand",
        "col_reserved": "Reserved",
        "col_unit": "Unit",
        "col_counted": "Physical count",
        "col_damaged": "Damaged",
        "col_variance": "Variance",
        "col_notes": "Notes",
        "default_unit": "pcs",
    },
    "ar": {
        "title": "ورقة جرد مخزني — {branch}",
        "date": "تاريخ الإنشاء: {datetime}",
        "responsible": "المسؤول: {name}",
        "col_product": "المنتج",
        "col_variant": "المتغير",
        "col_reference": "رمز المستخدم",
        "col_on_hand": "الرصيد",
        "col_reserved": "المحجوز",
        "col_unit": "الوحدة",
        "col_counted": "العد الفعلي",
        "col_damaged": "التالف",
        "col_variance": "الفرق",
        "col_notes": "ملاحظات",
        "default_unit": "قطعة",
    },
}


def _labels(locale: StockCountLocale) -> dict[str, str]:
    return _LABELS.get(locale, _LABELS["ar"])


def build_stock_count_pdf(
    *,
    branch_name: str,
    responsible_name: str,
    rows: list[dict],
    locale: StockCountLocale = "ar",
) -> bytes:
    L = _labels(locale)
    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M")

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()
    family = _register_unicode_font(pdf)

    pdf.set_font(family, size=12)
    title = L["title"].format(branch=branch_name)
    pdf.cell(0, 8, _txt(title, 120), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(family, size=8)
    meta = L["date"].format(datetime=generated_at)
    if responsible_name.strip():
        meta += f"  |  {L['responsible'].format(name=responsible_name)}"
    pdf.cell(0, 6, _txt(meta, 200), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    headers = [
        L["col_product"],
        L["col_variant"],
        L["col_reference"],
        L["col_on_hand"],
        L["col_reserved"],
        L["col_unit"],
        L["col_counted"],
        L["col_damaged"],
        L["col_variance"],
        L["col_notes"],
    ]
    widths = [38, 32, 22, 18, 18, 14, 18, 18, 18, 28]
    pdf.set_font(family, size=7)
    for w, h in zip(widths, headers, strict=True):
        pdf.cell(w, 6, _txt(h, 24), border=1)
    pdf.ln()

    default_unit = L["default_unit"]
    for row in rows:
        vals = [
            row.get("product_name", ""),
            row.get("variant_name", ""),
            row.get("reference_code", "") or "—",
            str(row.get("on_hand", 0)),
            str(row.get("reserved", 0)),
            row.get("uom_label", default_unit),
            "",
            "",
            "",
            "",
        ]
        for w, val in zip(widths, vals, strict=True):
            pdf.cell(w, 6, _txt(val, 48), border=1)
        pdf.ln()

    raw = pdf.output()
    return raw if isinstance(raw, bytes) else bytes(raw)


async def _resolve_category_filter(
    db: AsyncSession,
    *,
    category_id: int | None,
    category_include_descendants: bool,
) -> tuple[int | None, set[int] | None]:
    if category_id is None:
        return None, None
    if category_include_descendants:
        return None, await _category_descendant_ids(db, category_id)
    return category_id, None


async def export_stock_count_pdf_from_session(
    db: AsyncSession,
    *,
    session_id: int,
    locale: StockCountLocale = "ar",
) -> tuple[bytes, str]:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.branch import Branch
    from app.models.stock_count_session import StockCountSession

    res = await db.execute(
        select(StockCountSession)
        .where(StockCountSession.id == session_id)
        .options(selectinload(StockCountSession.lines))
    )
    session = res.scalar_one_or_none()
    if session is None:
        raise NotFoundError("Stock count session not found", details={"session_id": session_id})

    branch_res = await db.execute(select(Branch.name).where(Branch.id == session.branch_id))
    branch_name = str(branch_res.scalar_one_or_none() or session.branch_id)

    default_unit = _labels(locale)["default_unit"]
    pdf_rows: list[dict] = []
    for line in sorted(session.lines, key=lambda ln: (ln.product_name, ln.variant_name, ln.id)):
        pdf_rows.append(
            {
                "product_name": line.product_name,
                "variant_name": line.variant_name,
                "reference_code": line.reference_code or "—",
                "on_hand": line.system_on_hand,
                "reserved": line.system_reserved,
                "uom_label": default_unit,
            }
        )

    pdf_bytes = build_stock_count_pdf(
        branch_name=branch_name,
        responsible_name=session.responsible_name,
        rows=pdf_rows,
        locale=locale,
    )
    safe_branch = branch_name.replace(" ", "_")[:32]
    filename = f"stock_count_v{session.version_no}_{safe_branch}_{datetime.now(UTC).strftime('%Y%m%d')}.pdf"
    return pdf_bytes, filename


async def export_stock_count_pdf(
    db: AsyncSession,
    *,
    branch_id: int,
    category_id: int | None = None,
    category_include_descendants: bool = False,
    product_ids: list[int] | None = None,
    q: str | None = None,
    responsible_name: str = "",
    locale: StockCountLocale = "ar",
) -> tuple[bytes, str]:
    from sqlalchemy import select

    from app.models.branch import Branch
    from app.models.product import Product
    from app.models.unit_of_measure import UnitOfMeasure

    branch_res = await db.execute(select(Branch.name).where(Branch.id == branch_id))
    branch_name = str(branch_res.scalar_one_or_none() or branch_id)

    cat_id, cat_ids = await _resolve_category_filter(
        db,
        category_id=category_id,
        category_include_descendants=category_include_descendants,
    )
    stock_rows = await list_stock_on_hand(
        db,
        branch_id=branch_id,
        category_id=cat_id,
        category_ids=cat_ids,
        q=q,
        limit=5000,
        offset=0,
    )
    if product_ids:
        pid_set = set(product_ids)
        stock_rows = [r for r in stock_rows if r.product_id in pid_set]

    uom_ids = set()
    prod_ids = {r.product_id for r in stock_rows}
    uom_by_product: dict[int, int] = {}
    if prod_ids:
        pres = await db.execute(select(Product.id, Product.uom_id).where(Product.id.in_(prod_ids)))
        for pid, uid in pres.all():
            uom_by_product[int(pid)] = int(uid)
            uom_ids.add(int(uid))
    uom_labels: dict[int, str] = {}
    if uom_ids:
        ures = await db.execute(
            select(UnitOfMeasure.id, UnitOfMeasure.name, UnitOfMeasure.symbol).where(
                UnitOfMeasure.id.in_(uom_ids)
            )
        )
        for uid, name, symbol in ures.all():
            label = (str(name).strip() if name else "") or (str(symbol).strip() if symbol else "")
            uom_labels[int(uid)] = label or "pcs"

    default_unit = _labels(locale)["default_unit"]
    pdf_rows: list[dict] = []
    for r in stock_rows:
        uid = uom_by_product.get(r.product_id)
        pdf_rows.append(
            {
                "product_name": r.product_name,
                "variant_name": r.variant_name or r.variant_attributes,
                "reference_code": r.reference_code or "—",
                "on_hand": r.on_hand,
                "reserved": r.reserved,
                "uom_label": uom_labels.get(uid, default_unit) if uid else default_unit,
            }
        )

    pdf_bytes = build_stock_count_pdf(
        branch_name=branch_name,
        responsible_name=responsible_name,
        rows=pdf_rows,
        locale=locale,
    )
    safe_branch = branch_name.replace(" ", "_")[:32]
    filename = f"stock_count_{safe_branch}_{datetime.now(UTC).strftime('%Y%m%d')}.pdf"
    return pdf_bytes, filename
