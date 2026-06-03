import { describe, expect, it } from 'vitest';

import { cartesianVariantCount } from './cartesianCount';

describe('cartesianVariantCount', () => {
  it('returns 1 when no axes', () => {
    expect(cartesianVariantCount([])).toBe(1);
  });

  it('multiplies axis sizes', () => {
    expect(
      cartesianVariantCount([
        { valueIds: [1, 2] },
        { valueIds: [10, 20, 30] },
      ]),
    ).toBe(6);
  });

  it('ignores empty axes', () => {
    expect(
      cartesianVariantCount([{ valueIds: [1, 2] }, { valueIds: [] }]),
    ).toBe(2);
  });
});
