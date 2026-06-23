"""HTTP Content-Disposition helpers (RFC 5987 UTF-8 filenames)."""

from __future__ import annotations

from urllib.parse import quote


def _ascii_fallback_filename(filename: str) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode("ascii").strip()
    if ascii_name:
        return ascii_name
    suffix = ""
    if "." in filename:
        ext = filename.rsplit(".", 1)[-1]
        if ext.isascii() and ext.isalnum():
            suffix = f".{ext}"
    return f"download{suffix}"


def attachment_content_disposition(filename: str) -> str:
    """Build a Content-Disposition header value safe for non-ASCII filenames."""
    try:
        filename.encode("latin-1")
        return f'attachment; filename="{filename}"'
    except UnicodeEncodeError:
        fallback = _ascii_fallback_filename(filename)
        quoted = quote(filename, safe="")
        return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quoted}"
