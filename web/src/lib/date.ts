import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format as dfFormat,
  getDate,
  parseISO as dfParseISO,
} from 'date-fns';
import type { Locale } from 'date-fns/locale';
import { arSA as arSALocale, enUS as enUSLocale } from 'date-fns/locale';

import i18n from '@/i18n';

/*
 * Single-entry date module (Plan §7.3). `new Date(` is banned outside this
 * file by an ESLint `no-restricted-syntax` rule — every date parse / format
 * goes through here so the locale, timezone, and input shape stay uniform.
 */

export function now(): Date {
  return new Date();
}

/** UTC `YYYY-MM-DD` for API query params (matches backend calendar-day filtering). */
export function utcCalendarDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Last calendar day (1–31) for a month in the local calendar (used for `YYYY-MM-DD` period ends). */
export function lastCalendarDayOfMonth(year: number, month1Based: number): number {
  const first = dfParseISO(`${year}-${String(month1Based).padStart(2, '0')}-01`);
  return getDate(endOfMonth(first));
}

/** Serialize an instant as ISO-8601 UTC (e.g. for JSON metadata). */
export function toISOStringUtc(date: Date): string {
  return date.toISOString();
}

export function fromISO(iso: string): Date {
  return dfParseISO(iso);
}

export function fromTimestamp(ms: number): Date {
  return new Date(ms);
}

function localeForI18n(): Locale {
  return i18n.language?.startsWith('ar') ? arSALocale : enUSLocale;
}

export function format(date: Date, pattern = 'yyyy-MM-dd'): string {
  return dfFormat(date, pattern, { locale: localeForI18n() });
}

export function formatDateTime(date: Date, pattern = 'yyyy-MM-dd HH:mm'): string {
  return dfFormat(date, pattern, { locale: localeForI18n() });
}

/** Utility for cases where a caller holds an ISO string and wants a display. */
export function formatIso(iso: string, pattern?: string): string {
  return format(fromISO(iso), pattern);
}

/** Elapsed hours between two ISO-8601 instants (for attendance duration math). */
export function hoursBetween(isoStart: string, isoEnd: string): number {
  return (fromISO(isoEnd).getTime() - fromISO(isoStart).getTime()) / (1000 * 60 * 60);
}

/** Inclusive calendar-day span for API `date` / `YYYY-MM-DD` strings. */
export function inclusiveCalendarDaySpan(startIsoDate: string, endIsoDate: string): number {
  return differenceInCalendarDays(fromISO(endIsoDate), fromISO(startIsoDate)) + 1;
}

/** Last calendar day (YYYY-MM-DD) of an inclusive leave span starting at `startIsoDate`. */
export function inclusiveEndIsoDateFromStartAndDays(
  startIsoDate: string,
  inclusiveDayCount: number,
): string {
  const n = Math.max(1, Math.floor(inclusiveDayCount));
  const end = addDays(fromISO(startIsoDate), n - 1);
  return dfFormat(end, 'yyyy-MM-dd');
}
