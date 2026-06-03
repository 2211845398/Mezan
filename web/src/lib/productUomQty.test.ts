import { describe, expect, it } from 'vitest';

import type { ProductUomOption } from '@/features/purchasing/lib/productUomOptions';

import { baseUnitsToDisplayQty, qtyToBaseUnits } from './productUomQty';

const opts: ProductUomOption[] = [
  { id: 1, label: 'Piece', isBase: true, factorToBase: 1 },
  { id: 2, label: 'Box', factorToBase: 12 },
];

describe('productUomQty', () => {
  it('converts box qty to base', () => {
    expect(qtyToBaseUnits(1, 2, opts)).toBe(12);
    expect(qtyToBaseUnits(2, 1, opts)).toBe(2);
  });

  it('converts base to display qty in box', () => {
    expect(baseUnitsToDisplayQty(45, 2, opts)).toBe(3);
    expect(baseUnitsToDisplayQty(45, 1, opts)).toBe(45);
  });
});
