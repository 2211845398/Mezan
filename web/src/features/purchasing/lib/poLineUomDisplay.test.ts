import { describe, expect, it } from 'vitest';

import { formatPoLineQty, localizedPoLineUomDisplay } from './poLineUomDisplay';

const t = ((key: string) => {
  const map: Record<string, string> = {
    'products.uom_codes.BOX.symbol': 'صندوق',
    'products.uom_codes.PIECE.symbol': 'قطعة',
  };
  return map[key] ?? key;
}) as Parameters<typeof localizedPoLineUomDisplay>[0];

describe('localizedPoLineUomDisplay', () => {
  it('translates known English symbols', () => {
    expect(localizedPoLineUomDisplay(t, 'box', 'Box')).toBe('صندوق');
  });

  it('translates known English names when symbol is missing', () => {
    expect(localizedPoLineUomDisplay(t, undefined, 'Piece')).toBe('قطعة');
  });
});

describe('formatPoLineQty', () => {
  it('formats qty with localized unit', () => {
    expect(formatPoLineQty(t, 6, 'box', 'Box')).toBe('6 صندوق');
  });
});
