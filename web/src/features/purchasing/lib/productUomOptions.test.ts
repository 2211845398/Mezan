import { describe, expect, it } from 'vitest';

import type { ProductRead } from '@/features/catalog/api';

import { buildProductUomOptions } from './productUomOptions';

const t = ((key: string) => key) as Parameters<typeof buildProductUomOptions>[0];

describe('buildProductUomOptions', () => {
  it('returns base first then alternatives', () => {
    const product = {
      uom_id: 1,
      uom_name: 'Piece',
      uom_symbol: 'pcs',
      alternative_uoms: [
        {
          uom_id: 2,
          uom_code: 'BOX',
          uom_name: 'Box',
          uom_symbol: 'box',
          measurement_category: 'discrete',
          factor_to_base: 12,
        },
      ],
    } as ProductRead;

    const opts = buildProductUomOptions(t, product);
    expect(opts).toHaveLength(2);
    expect(opts[0]?.id).toBe(1);
    expect(opts[0]?.isBase).toBe(true);
    expect(opts[1]?.id).toBe(2);
  });
});
