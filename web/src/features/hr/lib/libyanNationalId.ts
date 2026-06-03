const NATIONAL_ID_RE = /^[12]\d{11}$/;

/** Strip non-digits for national ID entry. */
export function digitsOnlyNationalId(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 12);
}

/** Libyan national ID: 12 digits — gender (1|2), birth year (4), then 7 digits. */
export function isValidLibyanNationalId(raw: string): boolean {
  const digits = digitsOnlyNationalId(raw);
  if (!NATIONAL_ID_RE.test(digits)) return false;
  const year = Number(digits.slice(1, 5));
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear;
}
