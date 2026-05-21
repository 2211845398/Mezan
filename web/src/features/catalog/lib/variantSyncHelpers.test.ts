import { describe, expect, it } from 'vitest';

import type { VariantPreviewRow } from '../api';
import { mergePreviewWithDraftRows } from './variantSyncHelpers';

describe('mergePreviewWithDraftRows', () => {
  it('preserves price_extra from existing draft rows', () => {
    const preview: VariantPreviewRow[] = [
      {
        attribute_value_ids: [1, 2],
        suggested_sku: 'SKU-A',
        display_label: 'Product — Red — L',
        exists: false,
        attribute_summary: [],
      },
    ];
    const merged = mergePreviewWithDraftRows(preview, [
      {
        id: 9,
        attribute_value_ids: [1, 2],
        sku: 'SKU-CUSTOM',
        barcode: '123',
        active: true,
        price_extra: '12.50',
        display_label: 'old',
      },
    ]);
    expect(merged[0]?.sku).toBe('SKU-CUSTOM');
    expect(merged[0]?.price_extra).toBe('12.50');
    expect(merged[0]?.id).toBe(9);
  });
});
