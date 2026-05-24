import { describe, expect, it } from 'vitest';

import type { UnitOfMeasureRead } from '../api';
import {
  formatConversionFactor,
  getConversionHintUnits,
  normalizeProductUomsForSave,
  packagingRank,
  parseConversionFactorInput,
} from './uomConversion';

const piece: UnitOfMeasureRead = {
  id: 1,
  code: 'PIECE',
  name: 'Piece',
  symbol: 'pcs',
  measurement_category: 'discrete',
};
const box: UnitOfMeasureRead = {
  id: 2,
  code: 'BOX',
  name: 'Box',
  symbol: 'box',
  measurement_category: 'discrete',
};
const uoms = [piece, box];

describe('conversion factor formatting', () => {
  it('strips decimals from display', () => {
    expect(formatConversionFactor('15.0000')).toBe('15');
    expect(formatConversionFactor(12)).toBe('12');
  });

  it('parseConversionFactorInput accepts digits only', () => {
    expect(parseConversionFactorInput('15.0000')).toBe('15');
    expect(parseConversionFactorInput('abc12')).toBe('12');
  });
});

describe('packagingRank', () => {
  it('ranks box above piece', () => {
    expect(packagingRank(box)).toBeGreaterThan(packagingRank(piece));
  });
});

describe('getConversionHintUnits', () => {
  it('shows 1 Box = 12 Piece when base is Piece and alt is Box', () => {
    const hint = getConversionHintUnits(piece, box, 12);
    expect(hint?.left.code).toBe('BOX');
    expect(hint?.right.code).toBe('PIECE');
    expect(hint?.factor).toBe('12');
  });

  it('shows 1 Box = 12 Piece when base is Box and alt is Piece (inverted selection)', () => {
    const hint = getConversionHintUnits(box, piece, 12);
    expect(hint?.left.code).toBe('BOX');
    expect(hint?.right.code).toBe('PIECE');
    expect(hint?.factor).toBe('12');
  });
});

describe('normalizeProductUomsForSave', () => {
  it('keeps canonical storage when base is Piece and alt is Box', () => {
    const out = normalizeProductUomsForSave(1, [{ uom_id: 2, factor_to_base: '12' }], uoms);
    expect(out.uom_id).toBe(1);
    expect(out.alternative_uoms).toEqual([{ uom_id: 2, factor_to_base: '12' }]);
  });

  it('normalizes when user sets base Box and alt Piece with factor 12', () => {
    const out = normalizeProductUomsForSave(2, [{ uom_id: 1, factor_to_base: '12' }], uoms);
    expect(out.uom_id).toBe(1);
    expect(out.alternative_uoms).toEqual([{ uom_id: 2, factor_to_base: '12' }]);
  });
});
