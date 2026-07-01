/**
 * Shared helpers for sanitising and parsing numeric form input.
 * Supports Latin and Arabic-Indic digits; rejects scientific notation and stray text.
 */

export function mapArabicDigits(raw: string): string {
  return raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export type SanitiseDecimalOptions = {
  /** When false (default), minus signs are stripped. */
  allowNegative?: boolean;
};

/** Keep only digits and an optional single decimal point while typing. */
export function sanitiseDecimalInput(raw: string, options?: SanitiseDecimalOptions): string {
  const allowNegative = options?.allowNegative ?? false;
  const trimmed = raw.replace(/[\u066C\u002C\s]/g, '');
  const mapped = mapArabicDigits(trimmed);
  const pattern = allowNegative ? /^-?\d*(?:\.\d*)?/ : /^\d*(?:\.\d*)?/;
  const match = mapped.match(pattern);
  let out = match ? match[0] : '';
  if (!allowNegative) {
    out = out.replace(/-/g, '');
  }
  return out;
}

/** Strip non-digits and parse a non-negative integer; empty → null. */
export function parseNonNegativeInt(raw: string): number | null {
  const mapped = mapArabicDigits(raw.trim());
  const digits = mapped.replace(/[^\d]/g, '');
  if (digits === '') return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** Sanitise integer input to digits only (optionally empty). */
export function sanitiseIntegerInput(raw: string): string {
  return mapArabicDigits(raw).replace(/[^\d]/g, '');
}

export function clampInt(value: number, min: number, max?: number): number {
  let next = Math.max(min, Math.trunc(value));
  if (max != null) next = Math.min(max, next);
  return next;
}

/** Parse a non-negative decimal; invalid/empty → null. */
export function parseNonNegativeDecimal(raw: string): number | null {
  const s = sanitiseDecimalInput(raw, { allowNegative: false });
  if (!s || s === '.') return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Parse a strictly positive decimal; invalid/zero/negative → null. */
export function parsePositiveDecimal(raw: string): number | null {
  const n = parseNonNegativeDecimal(raw);
  if (n == null || n <= 0) return null;
  return n;
}
