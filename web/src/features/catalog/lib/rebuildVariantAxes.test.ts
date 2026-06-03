import { describe, expect, it } from 'vitest';

import type { CatalogAttributeValueRead } from '../api';
import { rebuildAxesFromValueIds } from './rebuildVariantAxes';

describe('rebuildAxesFromValueIds', () => {
  it('groups values by attribute', () => {
    const index = new Map<number, CatalogAttributeValueRead>([
      [1, { id: 1, attribute_id: 10, code: 'red', label: 'Red', sort_order: 0 }],
      [2, { id: 2, attribute_id: 10, code: 'blue', label: 'Blue', sort_order: 1 }],
      [3, { id: 3, attribute_id: 20, code: 's', label: 'S', sort_order: 0 }],
    ]);
    const axes = rebuildAxesFromValueIds([1, 2, 3], index);
    expect(axes).toHaveLength(2);
    const color = axes.find((a) => a.attributeId === 10);
    expect(color?.selectedValueIds).toEqual([1, 2]);
  });
});
