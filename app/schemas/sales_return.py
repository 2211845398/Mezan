"""Pydantic schemas for sales returns and exchanges."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SalesReturnLineRequest(BaseModel):
    sales_invoice_line_id: int
    qty: int = Field(gt=0)


class SalesReturnRequest(BaseModel):
    invoice_barcode: str
    reason: str | None = None
    lines: list[SalesReturnLineRequest]
    exchange_cart_id: int | None = None


class ReturnEligibleLineRead(BaseModel):
    sales_invoice_line_id: int
    product_id: int
    product_name: str
    product_sku: str
    qty_sold: int
    qty_already_returned: int
    qty_remaining: int

    model_config = ConfigDict(from_attributes=True)


class SalesInvoiceReturnLookupRead(BaseModel):
    invoice_id: int
    invoice_number: str
    invoice_barcode: str
    branch_id: int
    lines: list[ReturnEligibleLineRead]

    model_config = ConfigDict(from_attributes=True)


class ExchangeLinkDetailRead(BaseModel):
    """Resolved exchange link for a processed return (reads ``exchange_links``)."""

    sales_return_id: int
    new_cart_id: int
    original_sales_invoice_id: int
    original_invoice_number: str
    original_invoice_barcode: str
    branch_id: int
    original_cart_id: int
