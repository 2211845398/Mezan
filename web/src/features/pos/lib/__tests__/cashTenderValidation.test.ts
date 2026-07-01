import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { validateCashTender } from '@/features/pos/lib/cashTenderValidation';

describe('validateCashTender', () => {
  const due = new Decimal('100.00');

  it('allows zero cash when a customer is assigned', () => {
    expect(validateCashTender({ tendered: '0', amountDue: due, hasCustomer: true })).toEqual({
      valid: true,
    });
  });

  it('rejects zero cash without a customer', () => {
    expect(validateCashTender({ tendered: '0', amountDue: due, hasCustomer: false })).toEqual({
      valid: false,
      errorKey: 'tender.zero_needs_customer',
    });
  });

  it('rejects negative and non-numeric tender', () => {
    expect(validateCashTender({ tendered: '-5', amountDue: due, hasCustomer: true })).toEqual({
      valid: false,
      errorKey: 'tender.cash_negative',
    });
    expect(validateCashTender({ tendered: 'abc', amountDue: due, hasCustomer: true })).toEqual({
      valid: false,
      errorKey: 'tender.cash_invalid',
    });
  });

  it('allows partial cash with customer and full pay without customer', () => {
    expect(validateCashTender({ tendered: '40', amountDue: due, hasCustomer: true })).toEqual({
      valid: true,
    });
    expect(validateCashTender({ tendered: '100', amountDue: due, hasCustomer: false })).toEqual({
      valid: true,
    });
    expect(validateCashTender({ tendered: '40', amountDue: due, hasCustomer: false })).toEqual({
      valid: false,
      errorKey: 'tender.partial_cash_needs_customer',
    });
  });
});
