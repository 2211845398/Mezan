import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { roundCashTotal } from '../cashRounding';

describe('roundCashTotal', () => {
  it('rounds to nearest 0.05 with ROUND_HALF_UP', () => {
    const a = roundCashTotal('43.92', '0.05');
    expect(a.rounded.toFixed(2)).toBe('43.90');
    expect(a.roundingDifference.toFixed(2)).toBe('-0.02');

    const b = roundCashTotal('43.88', '0.05');
    expect(b.rounded.toFixed(2)).toBe('43.90');
    expect(b.roundingDifference.toFixed(2)).toBe('0.02');
  });

  it('returns exact total when increment is missing', () => {
    const { rounded, roundingDifference } = roundCashTotal(new Decimal('10.01'), null);
    expect(rounded.toFixed(2)).toBe('10.01');
    expect(roundingDifference.isZero()).toBe(true);
  });
});
