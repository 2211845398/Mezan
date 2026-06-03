import { describe, expect, it } from 'vitest';

import { isValidLibyanIban, normalizeLibyanIban } from '../libyanIban';

describe('libyanIban', () => {
  it('normalizes spacing and case', () => {
    expect(normalizeLibyanIban('ly12 3456 7890 1234 5678 9012 345')).toBe(
      'LY1234567890123456789012345',
    );
  });

  it('rejects wrong country or length', () => {
    expect(isValidLibyanIban('LY123')).toBe(false);
    expect(isValidLibyanIban('DE89370400440532013000')).toBe(false);
  });
});
