import { describe, expect, it } from 'vitest';

import {
  formatPurchasingVariantNameLabel,
  formatPurchasingVariantOption,
  formatPurchasingVariantReceiveLabel,
  formatPurchasingVariantSearchLabel,
  purchasingVariantSearchLabel,
} from './purchasingVariantLabel';

describe('formatPurchasingVariantOption', () => {
  it('formats with barcode and human attribute labels', () => {
    expect(
      formatPurchasingVariantOption({
        display_name: 'دولاب صيني',
        sku: 'CAT-001',
        barcode: '201000001059',
        attribute_values: { LEN: '10 متر' },
      }),
    ).toBe('[201000001059] دولاب صيني — 10 متر');
  });

  it('search label shows product (variant) - customer code', () => {
    expect(
      formatPurchasingVariantSearchLabel({
        display_name: 'دولاب صيني',
        sku: 'CAT-001',
        attribute_values: { LEN: '1 متر', WGT: '1kg' },
        reference_code: 'CUST-99',
      }),
    ).toBe('دولاب صيني (1 متر · 1kg) - CUST-99');
  });

  it('search label alias matches format function', () => {
    const item = {
      display_name: 'قميص بولو',
      sku: 'S',
      variant_label: 'أحمر',
      reference_code: 'R1',
    } as Parameters<typeof purchasingVariantSearchLabel>[0];
    expect(purchasingVariantSearchLabel(item)).toBe('قميص بولو (أحمر) - R1');
  });

  it('receive label uses same format as search', () => {
    expect(
      formatPurchasingVariantReceiveLabel({
        display_name: 'قميص',
        sku: 'SKU-1',
        attribute_values: { color: 'أخضر' },
        reference_code: 'CUST-99',
      }),
    ).toBe('قميص (أخضر) - CUST-99');
  });

  it('name-only label uses variant attributes without barcode', () => {
    expect(
      formatPurchasingVariantNameLabel({
        display_name: 'دولاب صيني',
        sku: 'CAT-001',
        attribute_values: { LEN: '1 متر', WGT: '1kg' },
      }),
    ).toBe('1 متر · 1kg');
  });

  it('falls back to sku when barcode missing', () => {
    expect(
      formatPurchasingVariantOption({
        display_name: 'Simple',
        sku: 'SKU-1',
        barcode: null,
        variant_label: '',
        attribute_values: null,
      }),
    ).toBe('[SKU-1] Simple');
  });
});
