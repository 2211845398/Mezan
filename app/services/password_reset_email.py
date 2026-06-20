"""Password-reset email copy (Arabic / English)."""

from __future__ import annotations

from typing import Literal

ResetLocale = Literal["ar", "en"]


def normalize_reset_locale(preferred_language: str | None) -> ResetLocale:
    """Map user preferred_language to reset email locale (default Arabic)."""
    if preferred_language and preferred_language.strip().lower().startswith("en"):
        return "en"
    return "ar"


def build_password_reset_otp_email(
    *,
    locale: ResetLocale,
    code: str,
    company_name: str,
) -> tuple[str, str, str]:
    """Return (subject, body_text, body_html) for a password-reset OTP message."""
    if locale == "en":
        subject = f"{company_name} — Password reset verification code"
        body_text = (
            f"Your {company_name} password reset verification code is: {code}\n\n"
            "This code expires in 10 minutes. If you did not request a password reset, "
            "ignore this email."
        )
        body_html = (
            f"<p>Your <strong>{company_name}</strong> password reset verification code is:</p>"
            f"<p style='font-size:24px;letter-spacing:4px'><strong>{code}</strong></p>"
            "<p>This code expires in 10 minutes. If you did not request a password reset, "
            "ignore this email.</p>"
        )
        return subject, body_text, body_html

    subject = f"{company_name} — رمز التحقق لإعادة تعيين كلمة المرور"
    body_text = (
        f"رمز التحقق لإعادة تعيين كلمة مرور {company_name}: {code}\n\n"
        "ينتهي الرمز خلال 10 دقائق. إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة."
    )
    body_html = (
        f"<p>رمز التحقق لإعادة تعيين كلمة مرور <strong>{company_name}</strong>:</p>"
        f"<p style='font-size:24px;letter-spacing:4px'><strong>{code}</strong></p>"
        "<p>ينتهي الرمز خلال 10 دقائق. إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة.</p>"
    )
    return subject, body_text, body_html
