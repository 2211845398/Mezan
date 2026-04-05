"""Pydantic schemas for sales returns and exchanges."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SalesReturnLineRequest(BaseModel):
    sales_invoice_line_id: int
    qty: int = Field(gt=0)


class SalesReturnRequest(BaseModel):
    invoice_barcode: str
    reason: str | None = None
    lines: list[SalesReturnLineRequest]
    exchange_cart_id: int | None = None
