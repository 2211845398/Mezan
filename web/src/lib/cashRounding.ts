import Decimal from 'decimal.js';

/** Mirrors `app/utils/cash_rounding.py` (ROUND_HALF_UP to nearest increment). */
export function roundCashTotal(
  exact: Decimal | string | number,
  increment: string | number | null | undefined,
): { rounded: Decimal; roundingDifference: Decimal } {
  const exactDec = new Decimal(exact);
  if (increment == null || increment === '' || new Decimal(increment).lte(0)) {
    const rounded = exactDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { rounded, roundingDifference: new Decimal(0) };
  }
  const inc = new Decimal(increment);
  const units = exactDec.div(inc).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const rounded = units.mul(inc).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const roundingDifference = rounded.minus(exactDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  return { rounded, roundingDifference };
}
