import { describe, expect, it } from 'vitest';

import { digitsOnlyNationalId, isValidLibyanNationalId } from '../libyanNationalId';

describe('libyanNationalId', () => {
  it('accepts valid 12-digit national ID', () => {
    expect(isValidLibyanNationalId('220030369666')).toBe(true);
    expect(isValidLibyanNationalId('1201201234567')).toBe(true);
  });

  it('rejects invalid gender digit', () => {
    expect(isValidLibyanNationalId('320030369666')).toBe(false);
  });

  it('strips non-digits', () => {
    expect(digitsOnlyNationalId('2-200-30369666')).toBe('220030369666');
  });
});
