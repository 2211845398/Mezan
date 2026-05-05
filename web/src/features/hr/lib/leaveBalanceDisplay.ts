import { formatNumber } from '@/lib/format';

/** Format API decimal strings for vacation balance columns. */
export function formatVacationBalanceRemaining(value: string | number | null | undefined): string {
  if (value == null || value === '') {
    return '—';
  }
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) {
    return '—';
  }
  return formatNumber(n, { maximumFractionDigits: 2 });
}
