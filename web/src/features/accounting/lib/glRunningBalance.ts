import Decimal from 'decimal.js';

import type { GeneralLedgerLineRead } from '../api';

/** Cumulative (debit - credit) running balance for one-account GL list. */
export function runningBalancesForGlLines(lines: GeneralLedgerLineRead[]): string[] {
  let r = new Decimal(0);
  return lines.map((ln) => {
    r = r.add(new Decimal(ln.debit).sub(new Decimal(ln.credit)));
    return r.toFixed(2);
  });
}
