"""Send purchase orders to suppliers (PDF email + state transition)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ValidationError
from app.models.purchase_order import PurchaseOrder
from app.models.suppliers import Supplier
from app.services import email_service
from app.services.email_service import EmailAttachment
from app.services.purchase_order_pdf_service import build_purchase_order_pdf_bytes
from app.services.purchase_order_service import load_purchase_order, mark_po_sent
from app.utils.contact_validation import parse_optional_email
from app.utils.request_locale import RequestLocale

_EMAIL_COPY: dict[RequestLocale, dict[str, str]] = {
    "ar": {
        "subject": "أمر شراء رقم {po_id} من {company}",
        "body": (
            "مرحباً،\n\n"
            "نرفق أمر الشراء رقم {po_id} بصيغة PDF.\n\n"
            "مع التحية،\n{company}"
        ),
    },
    "en": {
        "subject": "Purchase order #{po_id} from {company}",
        "body": (
            "Hello,\n\n"
            "Please find purchase order #{po_id} attached as a PDF.\n\n"
            "Regards,\n{company}"
        ),
    },
}


def _email_copy(locale: RequestLocale) -> dict[str, str]:
    return _EMAIL_COPY.get(locale, _EMAIL_COPY["ar"])


async def send_purchase_order_to_supplier(
    db: AsyncSession,
    *,
    po_id: int,
    idempotency_key: str | None = None,
    locale: RequestLocale = "ar",
    reply_to: str | None = None,
) -> PurchaseOrder:
    """Validate supplier email, send PDF, then mark the PO as sent (atomic)."""
    from app.core.errors import validation_error

    po = await load_purchase_order(db, po_id)

    if po.status == "sent":
        if idempotency_key and po.send_idempotency_key == idempotency_key:
            return po
        raise ValidationError(
            "Purchase order already sent",
            details={"po_id": po_id, "code": "purchase_order_already_sent"},
        )

    if po.supplier_id is None:
        validation_error(
            "supplier_id_required_for_send",
            "Link a supplier record before sending this purchase order",
            po_id=po_id,
        )

    res = await db.execute(select(Supplier).where(Supplier.id == po.supplier_id))
    supplier = res.scalar_one_or_none()
    if supplier is None:
        validation_error("supplier_not_found", "Supplier not found", supplier_id=po.supplier_id)

    contact = supplier.contact or {}
    to_email = parse_optional_email(contact.get("email"))
    if not to_email:
        validation_error(
            "supplier_email_missing",
            "Supplier contact email is required to send a purchase order",
            supplier_id=supplier.id,
        )

    company = settings.COMPANY_DISPLAY_NAME
    pdf_bytes, filename = await build_purchase_order_pdf_bytes(
        db, po, locale=locale, company_name=company
    )
    copy = _email_copy(locale)
    subject = copy["subject"].format(po_id=po.id, company=company)
    body_text = copy["body"].format(po_id=po.id, company=company)

    await email_service.send_email(
        to=to_email,
        subject=subject,
        body_text=body_text,
        attachments=[
            EmailAttachment(filename=filename, content=pdf_bytes, mime_type="application/pdf")
        ],
        reply_to=reply_to,
    )

    return await mark_po_sent(db, po_id=po_id, idempotency_key=idempotency_key)
