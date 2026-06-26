"""Two-factor authentication OTP email copy."""

from __future__ import annotations

from typing import Literal

from app.services.password_reset_email import normalize_reset_locale

OtpLocale = Literal["ar", "en"]


def build_two_factor_otp_email(
    *,
    locale: OtpLocale,
    code: str,
    company_name: str,
) -> tuple[str, str, str]:
    """Return (subject, body_text, body_html) for a login OTP message."""
    if locale == "en":
        subject = f"{company_name} — Sign-in verification code"
        body_text = (
            f"Your {company_name} sign-in verification code is: {code}\n\n"
            "This code expires in 10 minutes. If you did not try to sign in, ignore this email."
        )
        body_html = (
            f"<p>Your <strong>{company_name}</strong> sign-in verification code is:</p>"
            f"<p style='font-size:24px;letter-spacing:4px'><strong>{code}</strong></p>"
            "<p>This code expires in 10 minutes. If you did not try to sign in, ignore this email.</p>"
        )
        return subject, body_text, body_html

    subject = f"{company_name} — رمز التحقق لتسجيل الدخول"
    body_text = (
        f"رمز التحقق لتسجيل الدخول إلى {company_name}: {code}\n\n"
        "ينتهي الرمز خلال 10 دقائق. إذا لم تحاول تسجيل الدخول، تجاهل هذه الرسالة."
    )
    body_html = (
        f"<p>رمز التحقق لتسجيل الدخول إلى <strong>{company_name}</strong>:</p>"
        f"<p style='font-size:24px;letter-spacing:4px'><strong>{code}</strong></p>"
        "<p>ينتهي الرمز خلال 10 دقائق. إذا لم تحاول تسجيل الدخول، تجاهل هذه الرسالة.</p>"
    )
    return subject, body_text, body_html


def normalize_otp_locale(preferred_language: str | None) -> OtpLocale:
    return normalize_reset_locale(preferred_language)
