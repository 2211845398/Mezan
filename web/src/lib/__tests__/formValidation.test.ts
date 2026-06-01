import { describe, expect, it } from 'vitest';

import { getFirstErrorFieldName, hasFieldError, invalidFieldClass } from '../formValidation';

describe('getFirstErrorFieldName', () => {
  it('returns first field in display order', () => {
    const errors = {
      bank_account: { message: 'iban_invalid', type: 'custom' },
      hire_date: { message: 'Required', type: 'too_small' },
    };
    const order = ['hire_date', 'base_salary', 'hourly_rate', 'bank_account'];
    expect(getFirstErrorFieldName(errors, order)).toBe('hire_date');
  });

  it('skips fields without errors in order list', () => {
    const errors = {
      bank_account: { message: 'iban_invalid', type: 'custom' },
    };
    const order = ['hire_date', 'bank_account'];
    expect(getFirstErrorFieldName(errors, order)).toBe('bank_account');
  });

  it('falls back to object key order when no order provided', () => {
    const errors = {
      hourly_rate: { message: 'base_or_hourly', type: 'custom' },
    };
    expect(getFirstErrorFieldName(errors)).toBe('hourly_rate');
  });
});

describe('invalidFieldClass', () => {
  it('returns destructive border classes after failed submit', () => {
    const errors = { bank_account: { message: 'iban_invalid', type: 'custom' } };
    expect(invalidFieldClass(errors, 'bank_account', true)).toContain('border-destructive');
    expect(invalidFieldClass(errors, 'bank_account', true)).toContain('focus-visible:border-destructive');
    expect(hasFieldError(errors, 'bank_account')).toBe(true);
  });

  it('returns empty before submit even if errors exist', () => {
    const errors = { bank_account: { message: 'iban_invalid', type: 'custom' } };
    expect(invalidFieldClass(errors, 'bank_account', false)).toBe('');
  });

  it('returns empty string when field has no error', () => {
    expect(invalidFieldClass({}, 'bank_account', true)).toBe('');
  });
});
