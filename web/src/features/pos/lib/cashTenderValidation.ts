import Decimal from 'decimal.js';

export type CashTenderValidation = {
  valid: boolean;
  errorKey?: 'tender.cash_invalid' | 'tender.cash_negative' | 'tender.zero_needs_customer' | 'tender.partial_cash_needs_customer';
};

/** Validate POS cash tender for pay button / submit. */
export function validateCashTender(params: {
  tendered: string;
  amountDue: Decimal;
  hasCustomer: boolean;
}): CashTenderValidation {
  const raw = params.tendered.trim();
  if (!raw) return { valid: false };

  let td: Decimal;
  try {
    td = new Decimal(raw);
  } catch {
    return { valid: false, errorKey: 'tender.cash_invalid' };
  }

  if (!td.isFinite() || td.isNaN()) {
    return { valid: false, errorKey: 'tender.cash_invalid' };
  }
  if (td.isNegative()) {
    return { valid: false, errorKey: 'tender.cash_negative' };
  }
  if (td.greaterThanOrEqualTo(params.amountDue)) {
    return { valid: true };
  }
  if (!params.hasCustomer) {
    if (td.isZero()) {
      return { valid: false, errorKey: 'tender.zero_needs_customer' };
    }
    return { valid: false, errorKey: 'tender.partial_cash_needs_customer' };
  }
  return { valid: true };
}
