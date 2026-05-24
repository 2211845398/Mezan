import { describe, expect, it } from 'vitest';

import type { ProductUomOption } from '@/features/purchasing/lib/productUomOptions';

import { unitCostPerBaseUnit } from './productUomCost';

const options: ProductUomOption[] = [
  { id: 1, label: 'Piece', isBase: true, factorToBase: 1 },
  { id: 2, label: 'Box', factorToBase: 12 },
];

describe('unitCostPerBaseUnit', () => {
  it('divides line cost by factor when UoM is not base', () => {
    expect(unitCostPerBaseUnit('120', 2, options)).toBe('10.0000');
  });

  it('returns null for base UoM', () => {
    expect(unitCostPerBaseUnit('10', 1, options)).toBeNull();
  });
});
