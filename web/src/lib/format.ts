import Decimal from 'decimal.js';

import { format, formatDateTime as dateFormatDateTime, fromISO } from '@/lib/date';
import { getNumericLocale, type NumericLocale } from '@/lib/i18n-numbers';

/** All UI number/date formatting goes through this module (see ESLint). */
function numberFormatOptions(base: Intl.NumberFormatOptions): Intl.NumberFormatOptions {
  return { ...base, numberingSystem: 'latn' };
}

export function formatCompactCurrency(
  value: number | string,
  currency: string,
  { locale, fractionDigits = 1 }: { locale?: NumericLocale; fractionDigits?: number } = {},
): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return '';
  const loc = locale ?? getNumericLocale();
  return new Intl.NumberFormat(
    loc,
    numberFormatOptions({
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: 0,
    }),
  ).format(n);
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: NumericLocale,
): string {
  const loc = locale ?? getNumericLocale();
  return new Intl.NumberFormat(
    loc,
    numberFormatOptions({ style: 'decimal', ...(options ?? {}) }),
  ).format(value);
}

/** Compact notation (e.g. 1.2K) with Western digits. */
export function formatCompactNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: NumericLocale,
): string {
  const loc = locale ?? getNumericLocale();
  return new Intl.NumberFormat(
    loc,
    numberFormatOptions({
      notation: 'compact',
      maximumFractionDigits: 1,
      ...(options ?? {}),
    }),
  ).format(value);
}

/**
 * Fixed decimal places for display (MoneyInput, tables). Canonical value stays a string.
 */
export function formatFixedDecimal(
  value: number,
  fractionDigits: number,
  locale?: NumericLocale,
): string {
  const loc = locale ?? getNumericLocale();
  return new Intl.NumberFormat(
    loc,
    numberFormatOptions({
      style: 'decimal',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
  ).format(value);
}

export function formatCurrency(
  value: number | string,
  currency: string,
  options: { locale?: NumericLocale; fractionDigits?: number } = {},
): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return '';
  const { locale, fractionDigits = 2 } = options;
  const loc = locale ?? getNumericLocale();
  return new Intl.NumberFormat(
    loc,
    numberFormatOptions({
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
  ).format(n);
}

export function formatPercent(
  value: number,
  { fractionDigits = 1, locale }: { fractionDigits?: number; locale?: NumericLocale } = {},
): string {
  const loc = locale ?? getNumericLocale();
  return new Intl.NumberFormat(
    loc,
    numberFormatOptions({
      style: 'percent',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
  ).format(value);
}

/** Calendar dropdown: short month label, Western digits only. */
export function formatCalendarMonthShort(date: Date, locale?: NumericLocale): string {
  const loc = locale ?? getNumericLocale();
  return new Intl.DateTimeFormat(loc, {
    month: 'short',
    numberingSystem: 'latn',
  }).format(date);
}

/** ISO date for DOM attributes (ASCII). */
export function formatDate(value: Date | string, pattern = 'yyyy-MM-dd'): string {
  const d = typeof value === 'string' ? fromISO(value) : value;
  return format(d, pattern);
}

export function formatDateTime(value: Date | string, pattern = 'yyyy-MM-dd HH:mm'): string {
  const d = typeof value === 'string' ? fromISO(value) : value;
  return dateFormatDateTime(d, pattern);
}

/** MoneyInput: format canonical decimal string for display. */
export function formatMoneyCanonicalDisplay(
  canonical: string,
  locale: NumericLocale,
  fractionDigits: number,
): string {
  if (canonical === '' || canonical === '-' || canonical === '.' || canonical === '-.') {
    return canonical;
  }
  try {
    const d = new Decimal(canonical);
    return formatFixedDecimal(d.toNumber(), fractionDigits, locale);
  } catch {
    return canonical;
  }
}
