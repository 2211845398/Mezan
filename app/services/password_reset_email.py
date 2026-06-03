"""Password-reset email copy (Arabic / English)."""

from __future__ import annotations

from typing import Literal

ResetLocale = Literal["ar", "en"]


def normalize_reset_locale(preferred_language: str | None) -> ResetLocale:
    """Map user preferred_language to reset email locale (default Arabic)."""
    if preferred_language and preferred_language.strip().lower().startswith("en"):
        return "en"
    return "ar"


def build_password_reset_email(
    *,
    locale: ResetLocale,
    reset_url: str,
    company_name: str,
) -> tuple[str, str, str]:
    """Return (subject, body_text, body_html) for a password-reset message."""
    if locale == "en":
        subject = f"{company_name} — Reset your password"
        body_text = (
            f"You requested a password reset for your {company_name} account.\n\n"
            f"Open this link to choose a new password (valid for 60 minutes):\n"
            f"{reset_url}\n\n"
            "If you did not request this, you can ignore this email."
        )
        body_html = (
            f"<p>You requested a password reset for your <strong>{company_name}</strong> account.</p>"
            f'<p><a href="{reset_url}">Reset your password</a> (link expires in 60 minutes).</p>'
            "<p>If you did not request this, you can ignore this email.</p>"
        )
        return subject, body_text, body_html

    subject = f"{company_name} — إعادة تعيين كلمة المرور"
    body_text = (
        f"تلقّينا طلباً لإعادة تعيين كلمة مرور حسابك في {company_name}.\n\n"
        f"افتح الرابط التالي لاختيار كلمة مرور جديدة (صالح لمدة 60 دقيقة):\n"
        f"{reset_url}\n\n"
        "إذا لم تطلب ذلك، تجاهل هذه الرسالة."
    )
    body_html = (
        f"<p>تلقّينا طلباً لإعادة تعيين كلمة مرور حسابك في <strong>{company_name}</strong>.</p>"
        f'<p><a href="{reset_url}">إعادة تعيين كلمة المرور</a> (ينتهي الرابط خلال 60 دقيقة).</p>'
        "<p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>"
    )
    return subject, body_text, body_html
