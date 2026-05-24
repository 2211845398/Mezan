import type { TFunction } from 'i18next';

import type { ProductRead, UnitOfMeasureRead } from '@/features/catalog/api';
import { localizedUomLabel } from '@/features/catalog/lib/uomConversion';

export type ProductUomOption = {
  id: number;
  label: string;
  isBase?: boolean;
  /** Multiply line qty by this to get base units (1 for base UoM). */
  factorToBase?: number;
};

function uomFromProductBase(product: ProductRead): UnitOfMeasureRead | null {
  if (product.uom_id == null) return null;
  return {
    id: product.uom_id,
    code: (product as ProductRead & { uom_code?: string }).uom_code ?? 'PIECE',
    name: product.uom_name ?? 'Piece',
    symbol: product.uom_symbol ?? 'pcs',
    measurement_category: 'discrete',
  };
}

export function buildProductUomOptions(
  t: TFunction<'catalog'>,
  product: ProductRead,
): ProductUomOption[] {
  const options: ProductUomOption[] = [];
  const base = uomFromProductBase(product);
  if (base) {
    options.push({
      id: base.id,
      label: localizedUomLabel(t, base),
      isBase: true,
      factorToBase: 1,
    });
  }
  for (const alt of product.alternative_uoms ?? []) {
    const uom: UnitOfMeasureRead = {
      id: alt.uom_id,
      code: alt.uom_code,
      name: alt.uom_name,
      symbol: alt.uom_symbol,
      measurement_category: alt.measurement_category,
    };
    options.push({
      id: alt.uom_id,
      label: localizedUomLabel(t, uom),
      factorToBase: alt.factor_to_base,
    });
  }
  return options;
}
