"""OCR provider interface (Epic 2).

This isolates probabilistic extraction from deterministic business logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ExtractedInvoice:
    """Provider-neutral raw invoice extraction result."""

    payload: dict[str, Any]


class OcrProvider(Protocol):
    name: str

    async def extract_invoice(
        self, *, source_type: str, data: str
    ) -> ExtractedInvoice: ...

