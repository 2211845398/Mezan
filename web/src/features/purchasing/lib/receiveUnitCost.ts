import Decimal from 'decimal.js';

const UNIT_COST_SCALE = 4;

/** Canonical decimal string for goods-receipt `unit_cost` (matches backend Numeric 14,4). */
export function canonicalReceiveUnitCost(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('unit_cost required');
  }
  const d = new Decimal(trimmed);
  if (!d.isFinite() || d.lte(0)) {
    throw new Error('unit_cost must be positive');
  }
  return d.toFixed(UNIT_COST_SCALE, Decimal.ROUND_HALF_UP);
}

export function isPositiveReceiveUnitCost(raw: string): boolean {
  try {
    canonicalReceiveUnitCost(raw);
    return true;
  } catch {
    return false;
  }
}
