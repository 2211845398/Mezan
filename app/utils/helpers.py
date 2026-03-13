"""Shared helper utilities."""

from typing import Any


def paginate(items: list, page: int = 1, page_size: int = 20) -> dict[str, Any]:
    """
    Apply simple pagination to a list of items.

    Args:
        items: Full list of items to paginate.
        page: Current page number (1-indexed).
        page_size: Number of items per page.

    Returns:
        Dict with 'items', 'page', 'page_size', 'total', and 'pages' keys.
    """
    total = len(items)
    pages = max(1, (total + page_size - 1) // page_size)
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "items": items[start:end],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": pages,
    }


def api_response(
    data: Any = None,
    message: str = "Success",
    status: str = "ok",
) -> dict[str, Any]:
    """
    Build a standardised API response envelope.

    Args:
        data: Response payload.
        message: Human-readable message.
        status: Status string ('ok' or 'error').

    Returns:
        Dict with 'status', 'message', and 'data' keys.
    """
    return {
        "status": status,
        "message": message,
        "data": data,
    }
