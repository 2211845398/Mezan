"""Helpers for assertions against the standard API error envelope."""

from __future__ import annotations

from typing import Any


def api_error_detail_text(payload: dict[str, Any]) -> str:
    """Return a human-readable detail string from a JSON error body.

    Supports:
    - Envelope: ``{"error": {"code", "message", "details": {"detail": ...}}}``
      (HTTPException and AppError handlers).
    - Legacy root ``detail`` (string only), if present.
    """
    root = payload.get("detail")
    if isinstance(root, str) and root:
        return root
    err = payload.get("error")
    if not isinstance(err, dict):
        return ""
    details = err.get("details")
    if isinstance(details, dict):
        d = details.get("detail")
        if isinstance(d, str):
            return d
    msg = err.get("message")
    return msg if isinstance(msg, str) else ""
