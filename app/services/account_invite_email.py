"""Account verification invite email (temporary password)."""

from __future__ import annotations

from typing import Literal

from app.services.password_reset_email import ResetLocale, normalize_reset_locale

InviteLocale = Literal["ar", "en"]


def build_account_invite_email(
    *,
    locale: InviteLocale,
    login_url: str,
    email: str,
    temporary_password: str,
    company_name: str,
) -> tuple[str, str, str]:
    """Return (subject, body_text, body_html) for onboarding verification invite."""
    if locale == "en":
        subject = f"{company_name} — Activate your account"
        body_text = (
            f"Your {company_name} employee account is ready.\n\n"
            f"Email: {email}\n"
            f"Temporary password: {temporary_password}\n\n"
            f"Sign in and you will be asked to choose a new password:\n"
            f"{login_url}\n\n"
            "Do not share this password. It is for one-time activation only."
        )
        body_html = (
            f"<p>Your <strong>{company_name}</strong> employee account is ready.</p>"
            f"<p><strong>Email:</strong> {email}<br>"
            f"<strong>Temporary password:</strong> {temporary_password}</p>"
            f'<p><a href="{login_url}">Sign in</a> and choose a new password.</p>'
            "<p>Do not share this password. It is for one-time activation only.</p>"
        )
        return subject, body_text, body_html

    subject = f"{company_name} — تفعيل حسابك"
    body_text = (
        f"حسابك في {company_name} جاهز للتفعيل.\n\n"
        f"البريد الإلكتروني: {email}\n"
        f"كلمة المرور المؤقتة: {temporary_password}\n\n"
        f"سجّل الدخول وسيُطلب منك اختيار كلمة مرور جديدة:\n"
        f"{login_url}\n\n"
        "لا تشارك كلمة المرور المؤقتة مع أحد."
    )
    body_html = (
        f"<p>حسابك في <strong>{company_name}</strong> جاهز للتفعيل.</p>"
        f"<p><strong>البريد الإلكتروني:</strong> {email}<br>"
        f"<strong>كلمة المرور المؤقتة:</strong> {temporary_password}</p>"
        f'<p><a href="{login_url}">تسجيل الدخول</a> واختيار كلمة مرور جديدة.</p>'
        "<p>لا تشارك كلمة المرور المؤقتة مع أحد.</p>"
    )
    return subject, body_text, body_html


def normalize_invite_locale(preferred_language: str | None) -> ResetLocale:
    return normalize_reset_locale(preferred_language)
