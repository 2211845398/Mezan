import { formatDateTime, fromISO, now } from '@/lib/date';

import type { CartRead, SalesInvoiceDetailRead } from '../api';
import type { ThermalReceiptModel } from './types';

export function tmpWatermarkFromClientUuid(clientUuid: string): string {
  const raw = clientUuid.replace(/-/g, '').slice(0, 8).toUpperCase();
  return raw.length >= 8 ? `TMP-${raw.slice(0, 8)}` : `TMP-${clientUuid.slice(0, 8)}`;
}

export function thermalModelFromCart(
  cart: CartRead,
  opts: {
    currency: string;
    branchLabel: string;
    invoiceNumber?: string | null;
    provisionalWatermark?: string;
    paymentMethod?: string | null;
    tendered?: string | null;
    changeDue?: string | null;
    remaining?: string | null;
    createdAt?: Date;
  },
): ThermalReceiptModel {
  const lines = (cart.lines ?? []).map((ln) => ({
    name: ln.product_name || ln.product_sku,
    qty: ln.qty,
    unitPrice: ln.unit_price,
    lineTotal: ln.line_total,
    taxAmount: ln.line_tax_amount,
  }));

  const base: ThermalReceiptModel = {
    branchLabel: opts.branchLabel,
    invoiceNumber: opts.invoiceNumber ?? null,
    currency: opts.currency,
    lines,
    subtotal: cart.subtotal,
    discountTotal: cart.discount_total,
    taxTotal: cart.tax_total,
    total: cart.total,
    paymentMethod: opts.paymentMethod ?? null,
    tendered: opts.tendered ?? null,
    changeDue: opts.changeDue ?? null,
    remaining: opts.remaining ?? null,
    createdAtLabel: formatDateTime(opts.createdAt ?? now()),
  };
  return opts.provisionalWatermark !== undefined
    ? { ...base, provisionalWatermark: opts.provisionalWatermark }
    : base;
}

export function thermalModelFromCreditNote(opts: {
  branchLabel: string;
  currency: string;
  creditNumber: string;
  total: string;
  lines: ThermalReceiptModel['lines'];
}): ThermalReceiptModel {
  return {
    branchLabel: opts.branchLabel,
    invoiceNumber: null,
    creditNumber: opts.creditNumber,
    isReturn: true,
    currency: opts.currency,
    lines: opts.lines,
    subtotal: opts.total,
    discountTotal: '0',
    taxTotal: '0',
    total: opts.total,
    createdAtLabel: formatDateTime(now()),
  };
}

export function thermalModelFromInvoiceDetail(
  inv: SalesInvoiceDetailRead,
  opts: { branchLabel: string; currency: string },
): ThermalReceiptModel {
  const lines = (inv.lines ?? []).map((ln) => ({
    name: ln.product_name,
    qty: ln.qty,
    unitPrice: ln.unit_price,
    lineTotal: ln.line_total,
    taxAmount: ln.line_tax_amount,
  }));

  const pay = inv.payments?.[0];

  return {
    branchLabel: opts.branchLabel,
    invoiceNumber: inv.invoice_number,
    currency: opts.currency,
    lines,
    subtotal: inv.subtotal,
    discountTotal: inv.discount_total,
    taxTotal: inv.tax_total,
    total: inv.total,
    paymentMethod: pay?.method ?? null,
    tendered: pay?.amount ?? null,
    changeDue: null,
    createdAtLabel: formatDateTime(fromISO(inv.created_at)),
  };
}
