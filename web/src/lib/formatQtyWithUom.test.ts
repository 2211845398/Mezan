import { describe, expect, it } from 'vitest';

import { formatQtyWithUom } from './formatQtyWithUom';

describe('formatQtyWithUom', () => {
  it('appends unit symbol', () => {
    expect(formatQtyWithUom(5, 'pcs')).toBe('5 pcs');
  });

  it('returns qty only when symbol missing', () => {
    expect(formatQtyWithUom(3, '')).toBe('3');
  });
});
