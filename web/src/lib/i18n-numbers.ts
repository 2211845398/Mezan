import { env } from '@/config/env';

/*
 * Locale-aware number / currency / percent formatting. Single source of truth
 * for every digit we render, per `WEB_FRONTEND_PLAN.md` §6.3.
 *
 * The default is `ar-EG` (Eastern Arabic numerals) and can be overridden
 * per-deployment through `VITE_LOCALE_NUMBERS`. Specific call-sites that
 * want Latin digits inside an Arabic UI (receipts, code blocks) can pass
 * `en-US` explicitly.
 */

export type NumericLocale = 'ar-EG' | 'ar-SA' | 'en-US';

export function getNumericLocale(): NumericLocale {
  return env.VITE_LOCALE_NUMBERS;
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: NumericLocale,
): string {
  const resolved: Intl.NumberFormatOptions = { style: 'decimal', ...(options ?? {}) };
  return new Intl.NumberFormat(locale ?? getNumericLocale(), resolved).format(value);
}

/**
 * Format a `decimal.js`-style canonical string or a number as money. Backend
 * amounts are `Decimal q2`, so we default to `minimumFractionDigits: 2` and
 * accept a string to avoid a float round-trip on the display path.
 */
export function formatMoney(
  value: number | string,
  options: { currency?: string; locale?: NumericLocale; fractionDigits?: number } = {},
): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return '';
  const { currency, locale, fractionDigits = 2 } = options;
  return new Intl.NumberFormat(locale ?? getNumericLocale(), {
    style: currency ? 'currency' : 'decimal',
    ...(currency ? { currency } : {}),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

export function formatPercent(
  value: number,
  { fractionDigits = 1, locale }: { fractionDigits?: number; locale?: NumericLocale } = {},
): string {
  return new Intl.NumberFormat(locale ?? getNumericLocale(), {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
