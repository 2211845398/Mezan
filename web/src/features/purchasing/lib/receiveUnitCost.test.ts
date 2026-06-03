import { describe, expect, it } from 'vitest';

import { canonicalReceiveUnitCost, isPositiveReceiveUnitCost } from './receiveUnitCost';

describe('receiveUnitCost', () => {
  it('formats to 4 decimal places', () => {
    expect(canonicalReceiveUnitCost('12.5')).toBe('12.5000');
  });

  it('rejects non-positive', () => {
    expect(isPositiveReceiveUnitCost('0')).toBe(false);
    expect(isPositiveReceiveUnitCost('')).toBe(false);
  });
});
