"""Fake OCR provider for development/testing (Epic 2)."""

from __future__ import annotations

from app.services.ocr.providers.base import ExtractedInvoice


class FakeOcrProvider:
    name = "fake"

    async def extract_invoice(self, *, source_type: str, data: str) -> ExtractedInvoice:
        # For now we just echo input into a predictable structure.
        return ExtractedInvoice(
            payload={
                "source_type": source_type,
                "raw_data": data,
            }
        )

