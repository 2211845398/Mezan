"""Outbound email (SMTP or mock) with optional attachments."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate

import aiosmtplib

from app.core.config import settings
from app.core.errors import ExternalServiceError, _details_with_code

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    mime_type: str = "application/octet-stream"


def _use_mock_sender() -> bool:
    if not settings.EMAIL_ENABLED:
        return True
    return settings.EMAIL_PROVIDER.strip().lower() == "mock"


def _format_from_header() -> str:
    addr = (settings.EMAIL_FROM or "noreply@mezan.local").strip()
    name = (settings.EMAIL_FROM_NAME or settings.COMPANY_DISPLAY_NAME or "Mezan").strip()
    return formataddr((name, addr))


async def send_email(
    *,
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    attachments: list[EmailAttachment] | None = None,
    reply_to: str | None = None,
) -> None:
    """Send one email. Mock mode logs and returns; SMTP failures raise ``email_delivery_failed``."""
    attachment_list = attachments or []
    if _use_mock_sender():
        logger.info(
            "Mock email to=%s subject=%r attachments=%s",
            to,
            subject,
            [a.filename for a in attachment_list],
        )
        return

    if settings.EMAIL_PROVIDER.strip().lower() != "smtp":
        raise ExternalServiceError(
            "Unsupported email provider",
            details=_details_with_code("email_delivery_failed", provider=settings.EMAIL_PROVIDER),
        )

    host = (settings.SMTP_HOST or "").strip()
    if not host:
        raise ExternalServiceError(
            "SMTP_HOST is not configured",
            details=_details_with_code("email_delivery_failed"),
        )

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = _format_from_header()
    msg["To"] = to
    msg["Date"] = formatdate(localtime=True)
    if reply_to:
        msg["Reply-To"] = reply_to.strip()

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        alt.attach(MIMEText(body_html, "html", "utf-8"))
    msg.attach(alt)

    for att in attachment_list:
        part = MIMEApplication(att.content, _subtype=_mime_subtype(att.mime_type))
        part.add_header("Content-Disposition", "attachment", filename=att.filename)
        msg.attach(part)

    try:
        if settings.SMTP_USE_SSL:
            await aiosmtplib.send(
                msg,
                hostname=host,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                use_tls=True,
            )
        else:
            await aiosmtplib.send(
                msg,
                hostname=host,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                start_tls=settings.SMTP_USE_TLS,
            )
    except Exception as exc:
        logger.warning("SMTP send failed to=%s: %s", to, exc)
        raise ExternalServiceError(
            "Email delivery failed",
            details=_details_with_code("email_delivery_failed", error=str(exc)[:300]),
        ) from exc


def _mime_subtype(mime_type: str) -> str:
    if "/" in mime_type:
        return mime_type.split("/", 1)[1]
    return "octet-stream"
