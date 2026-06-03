import { describe, expect, it } from 'vitest';

import { a4ModelFromInvoiceDetail } from './a4InvoiceModel';

describe('a4ModelFromInvoiceDetail', () => {
  it('maps invoice detail to A4 print model', () => {
    const model = a4ModelFromInvoiceDetail({
      id: 1,
      invoice_number: 'INV-100',
      invoice_barcode: 'BC100',
      cart_id: 1,
      terminal_id: 1,
      branch_id: 2,
      branch_name: 'Main',
      customer_id: 5,
      customer_display: 'Acme Co',
      currency_code: 'USD',
      company_legal_name: 'Mezan Retail',
      subtotal: '100.00',
      discount_total: '0',
      tax_total: '10.00',
      total: '110.00',
      created_at: '2026-05-01T12:00:00Z',
      voided_at: null,
      void_reason: null,
      lines: [
        {
          id: 1,
          product_id: 1,
          product_name: 'Widget',
          product_sku: 'W-1',
          barcode: null,
          qty: 2,
          unit_price: '50.00',
          line_total: '100.00',
          tax_rate: '0.1',
          line_tax_amount: '10.00',
        },
      ],
      payments: [{ method: 'cash', amount: '110.00', reference: null, currency: 'USD' }],
    });

    expect(model.invoiceNumber).toBe('INV-100');
    expect(model.companyName).toBe('Mezan Retail');
    expect(model.lines).toHaveLength(1);
    expect(model.lines[0]?.sku).toBe('W-1');
    expect(model.paymentMethod).toBe('cash');
  });
});
