"""Content-Disposition header encoding for non-ASCII filenames."""

from urllib.parse import quote

from app.utils.content_disposition import attachment_content_disposition


def test_attachment_content_disposition_ascii_unchanged() -> None:
    value = attachment_content_disposition("stock_count_v1_main_20260101.pdf")
    assert value == 'attachment; filename="stock_count_v1_main_20260101.pdf"'


def test_attachment_content_disposition_arabic_uses_rfc5987() -> None:
    filename = "تقرير_الجرد.pdf"
    value = attachment_content_disposition(filename)
    assert value == f"attachment; filename=\"download.pdf\"; filename*=UTF-8''{quote(filename, safe='')}"
