/** Sales invoice primary key — must be a positive integer DB id, not invoice_number. */
export function assertInvoicePkId(id: unknown): number {
  if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
    return id;
  }
  if (typeof id === 'string' && /^\d+$/.test(id)) {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0) {
      return n;
    }
  }
  throw new Error('invalid_invoice_id');
}

export function isValidInvoicePkId(id: unknown): id is number {
  try {
    assertInvoicePkId(id);
    return true;
  } catch {
    return false;
  }
}
