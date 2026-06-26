import { describe, expect, it, vi } from 'vitest';

import {
  draftLineFromRestockPrefillLine,
  hydrateDraftLineUom,
} from '@/features/inventory/pages/transfers/transferRestockPrefill';

vi.mock('@/features/catalog/api', () => ({
  getProduct: vi.fn(),
}));

import { getProduct } from '@/features/catalog/api';

const tCatalog = ((key: string) => key) as never;

describe('transferRestockPrefill', () => {
  it('draftLineFromRestockPrefillLine preserves product_image_url', () => {
    const line = draftLineFromRestockPrefillLine({
      product_id: 1,
      variant_id: 2,
      qty: 5,
      uom_id: 10,
      product_name: 'Shirt',
      variant_name: 'Red L',
      product_image_url: '/uploads/shirt.jpg',
    });
    expect(line.product_image_url).toBe('/uploads/shirt.jpg');
    expect(line.uom_label).toBe('');
  });

  it('hydrateDraftLineUom fills uom fields and qty_base', async () => {
    vi.mocked(getProduct).mockResolvedValue({
      id: 1,
      uom_id: 10,
      uom_symbol: 'pcs',
      uom_name: 'Piece',
      image_url: '/uploads/shirt.jpg',
      alternative_uoms: [],
    } as never);

    const base = draftLineFromRestockPrefillLine({
      product_id: 1,
      variant_id: 2,
      qty: 5,
      uom_id: 10,
      product_name: 'Shirt',
      variant_name: 'Red L',
    });

    const hydrated = await hydrateDraftLineUom(tCatalog, base);

    expect(hydrated.uom_symbol).toBe('pcs');
    expect(hydrated.uom_name).toBe('Piece');
    expect(hydrated.uom_label).toBeTruthy();
    expect(hydrated.qty_base).toBe(5);
    expect(hydrated.product_image_url).toBe('/uploads/shirt.jpg');
  });
});
