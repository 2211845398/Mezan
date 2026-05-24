import { describe, expect, it } from 'vitest';

import { isBalanced, sumDebit, sumCredit } from './journalLineBalance';

describe('journalLineBalance', () => {
  it('detects balanced lines', () => {
    const lines = [
      { debit: '100.00', credit: '0' },
      { debit: '0', credit: '100.00' },
    ];
    expect(sumDebit(lines)).toBe('100.00');
    expect(sumCredit(lines)).toBe('100.00');
    expect(isBalanced(lines)).toBe(true);
  });

  it('detects unbalanced lines', () => {
    const lines = [
      { debit: '100.00', credit: '0' },
      { debit: '0', credit: '50.00' },
    ];
    expect(isBalanced(lines)).toBe(false);
  });
});
