import { describe, expect, it } from 'vitest';

import {
  parseNonNegativeDecimal,
  parseNonNegativeInt,
  parsePositiveDecimal,
  sanitiseDecimalInput,
  sanitiseIntegerInput,
} from '@/lib/numericInput';

describe('numericInput', () => {
  it('sanitises decimal input and rejects negatives by default', () => {
    expect(sanitiseDecimalInput('-12.5abc')).toBe('12.5');
    expect(sanitiseDecimalInput('1e5')).toBe('1');
  });

  it('allows negatives when configured', () => {
    expect(sanitiseDecimalInput('-3.25', { allowNegative: true })).toBe('-3.25');
  });

  it('maps Arabic digits for integers', () => {
    expect(parseNonNegativeInt('١٢٣')).toBe(123);
    expect(sanitiseIntegerInput('abc٤٥')).toBe('45');
  });

  it('parses positive decimals strictly', () => {
    expect(parsePositiveDecimal('0')).toBeNull();
    expect(parsePositiveDecimal('-1')).toBeNull();
    expect(parsePositiveDecimal('12.50')).toBe(12.5);
    expect(parseNonNegativeDecimal('0')).toBe(0);
  });
});
