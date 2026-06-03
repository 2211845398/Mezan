"""Localized user-visible copy for payroll notifications."""

from __future__ import annotations

from datetime import date

_AR_MONTH_NAMES: tuple[str, ...] = (
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
)


def normalize_notification_lang(preferred_language: str | None) -> str:
    if not preferred_language:
        return "en"
    low = preferred_language.strip().lower()
    return "ar" if low.startswith("ar") else "en"


def format_payroll_month_label(period_start: date, lang: str) -> str:
    if lang == "ar":
        return f"{_AR_MONTH_NAMES[period_start.month - 1]} {period_start.year}"
    return period_start.strftime("%B %Y")


def payslip_paid_notification_copy(
    *, lang: str, period_start: date, payslip_id: int
) -> tuple[str, str]:
    month_label = format_payroll_month_label(period_start, lang)
    if lang == "ar":
        return (
            "تم إيداع الراتب",
            f"تم إيداع راتبك عن شهر {month_label} (قسيمة رقم {payslip_id}).",
        )
    return (
        "Salary deposited",
        f"Your salary for {month_label} has been deposited (payslip #{payslip_id}).",
    )
