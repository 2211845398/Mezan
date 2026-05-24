import type { ProductUomOption } from '@/features/purchasing/lib/productUomOptions';

/** Convert line qty in selected UoM to base units for stock checks. */
export function qtyToBaseUnits(
  qty: number,
  uomId: number,
  options: ProductUomOption[],
): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const opt = options.find((o) => o.id === uomId);
  const factor = opt?.factorToBase ?? 1;
  return Math.round(qty * factor);
}

/** Convert base units to display qty in selected UoM (floor for availability hints). */
export function baseUnitsToDisplayQty(
  baseQty: number,
  uomId: number,
  options: ProductUomOption[],
): number {
  if (!Number.isFinite(baseQty) || baseQty <= 0) return 0;
  const opt = options.find((o) => o.id === uomId);
  const factor = opt?.factorToBase ?? 1;
  if (factor <= 1) return baseQty;
  return Math.floor(baseQty / factor);
}
