import { z } from 'zod';

/**
 * Libyan national phone: `09` + operator digit 1–5 + seven subscriber digits (10 digits).
 * Matches backend `app.utils.libyan_phone.LIBYAN_MOBILE_RE`.
 */
export const LY_MOBILE_RE = /^09[1-5]\d{7}$/;

export function normalizeLyPhoneInput(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function isLibyanMobilePhone(raw: string): boolean {
  const s = normalizeLyPhoneInput(raw.trim());
  return LY_MOBILE_RE.test(s);
}

/** Optional phone: empty is OK; otherwise must be a Libyan national number. */
export function zodLibyanPhoneOptional(invalidMessage: string) {
  return z.string().refine(
    (v) => {
      const s = v.trim();
      return s.length === 0 || isLibyanMobilePhone(s);
    },
    { message: invalidMessage },
  );
}

/** Optional email: empty is OK; otherwise RFC-style check via Zod. */
export function zodOptionalNonEmptyEmail(invalidMessage: string) {
  return z.string().refine(
    (v) => {
      const s = v.trim();
      return s.length === 0 || z.string().email().safeParse(s).success;
    },
    { message: invalidMessage },
  );
}

export function isNonEmptyValidEmail(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  return z.string().email().safeParse(s).success;
}
