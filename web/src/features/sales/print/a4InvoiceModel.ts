import { formatDateTime, fromISO } from '@/lib/date';

import type { SalesInvoiceDetailRead } from '@/features/pos/api';

export type A4InvoiceLine = {
  sku: string;
  description: string;
  qty: number;
  unitPrice: string;
  taxAmount: string;
  lineTotal: string;
};

export type A4InvoiceModel = {
  companyName: string;
  branchName: string;
  invoiceNumber: string;
  invoiceBarcode: string;
  createdAtLabel: string;
  customerDisplay: string | null;
  currency: string;
  lines: A4InvoiceLine[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  paymentMethod: string | null;
  voided: boolean;
  voidReason: string | null;
};

export function a4ModelFromInvoiceDetail(inv: SalesInvoiceDetailRead): A4InvoiceModel {
  const pay = inv.payments?.[0];
  return {
    companyName: inv.company_legal_name?.trim() || inv.branch_name?.trim() || '',
    branchName: inv.branch_name?.trim() || '',
    invoiceNumber: inv.invoice_number,
    invoiceBarcode: inv.invoice_barcode,
    createdAtLabel: formatDateTime(fromISO(inv.created_at)),
    customerDisplay: inv.customer_display?.trim() || null,
    currency: inv.currency_code?.trim() || pay?.currency?.trim() || 'USD',
    lines: (inv.lines ?? []).map((ln) => ({
      sku: ln.barcode?.trim() || ln.product_sku?.trim() || '—',
      description: ln.product_name,
      qty: ln.qty,
      unitPrice: String(ln.unit_price),
      taxAmount: String(ln.line_tax_amount),
      lineTotal: String(ln.line_total),
    })),
    subtotal: String(inv.subtotal),
    discountTotal: String(inv.discount_total),
    taxTotal: String(inv.tax_total),
    total: String(inv.total),
    paymentMethod: pay?.method ?? null,
    voided: Boolean(inv.voided_at),
    voidReason: inv.void_reason?.trim() || null,
  };
}
