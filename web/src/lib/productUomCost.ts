import Decimal from 'decimal.js';

import type { ProductUomOption } from '@/features/purchasing/lib/productUomOptions';

const COST_SCALE = 4;

/** Per-base-unit cost when line unit cost is entered in the selected UoM. */
export function unitCostPerBaseUnit(
  lineUnitCost: string,
  uomId: number,
  options: ProductUomOption[],
): string | null {
  const trimmed = lineUnitCost.trim().replace(',', '.');
  if (!trimmed) return null;
  const opt = options.find((o) => o.id === uomId);
  const factor = opt?.factorToBase ?? 1;
  if (factor <= 1) return null;
  try {
    const d = new Decimal(trimmed);
    if (!d.isFinite() || d.lte(0)) return null;
    return d.div(factor).toFixed(COST_SCALE, Decimal.ROUND_HALF_UP);
  } catch {
    return null;
  }
}

export function selectedUomLabel(uomId: number, options: ProductUomOption[]): string {
  return options.find((o) => o.id === uomId)?.label ?? '';
}
