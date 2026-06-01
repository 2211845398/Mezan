/** Normalize IBAN: uppercase, no spaces. */
export function normalizeLibyanIban(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase();
}

function ibanMod97(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = '';
  for (const ch of rearranged) {
    const expanded = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    remainder += expanded;
    if (remainder.length > 9) {
      remainder = String(Number(remainder) % 97);
    }
  }
  return Number(remainder) % 97 === 1;
}

/** Libyan IBAN: LY + 23 digits (25 characters). */
export function isValidLibyanIban(raw: string): boolean {
  const iban = normalizeLibyanIban(raw);
  if (!/^LY\d{23}$/.test(iban)) return false;
  return ibanMod97(iban);
}
