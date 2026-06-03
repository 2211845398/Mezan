import Decimal from 'decimal.js';

import { fromISO } from '@/lib/date';

/** Approximate hours between clock in/out; matches server overlap logic in spirit for UI. */
export function hoursBetweenClocks(clockInIso: string, clockOutIso: string | null | undefined): Decimal {
  if (!clockOutIso) return new Decimal(0);
  const a = fromISO(clockInIso).getTime();
  const b = fromISO(clockOutIso).getTime();
  if (!(a > 0) || !(b > 0) || b <= a) return new Decimal(0);
  return new Decimal(b - a).div(1000 * 3600);
}

export function totalHoursFromLogs(
  logs: { clock_in_at: string; clock_out_at?: string | null | undefined }[],
): string {
  let t = new Decimal(0);
  for (const ln of logs) {
    t = t.plus(hoursBetweenClocks(ln.clock_in_at, ln.clock_out_at));
  }
  return t.toFixed(2);
}
