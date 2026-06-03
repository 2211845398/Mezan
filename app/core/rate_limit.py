"""Shared application rate limiting helpers."""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.utils.security import decode_token


def rate_limit_key(request: Request) -> str:
    """Prefer per-user key when a valid access token is present; else IP address."""
    auth = request.headers.get("Authorization") or ""
    if auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
        payload = decode_token(token)
        if payload and payload.get("type") == "access":
            sub = payload.get("sub")
            if sub is not None:
                return f"user:{sub}"
    return get_remote_address(request)


limiter = Limiter(key_func=rate_limit_key)
