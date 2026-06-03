/** Client-side fallback when suggest-code API is unavailable. */
export function suggestChildCodeClient(parentCode: string, siblingCodes: string[]): string {
  const prefix = parentCode;
  const extensions: Array<{ num: number; width: number }> = [];

  for (const code of siblingCodes) {
    if (code.startsWith(prefix) && code.length > prefix.length) {
      const suffix = code.slice(prefix.length);
      if (/^\d+$/.test(suffix)) {
        extensions.push({ num: Number(suffix), width: suffix.length });
      }
    }
  }

  if (extensions.length > 0) {
    const nextNum = Math.max(...extensions.map((e) => e.num)) + 1;
    const width = Math.max(...extensions.map((e) => e.width), 2);
    return `${prefix}${String(nextNum).padStart(width, '0')}`;
  }

  if (/^\d+$/.test(prefix)) {
    return `${prefix}01`;
  }

  const numericSiblings = siblingCodes.filter((c) => /^\d+$/.test(c));
  if (numericSiblings.length > 0) {
    const maxCode = Math.max(...numericSiblings.map((c) => Number(c)));
    const width = Math.max(...numericSiblings.map((c) => c.length));
    return String(maxCode + 1).padStart(width, '0');
  }

  return `${prefix}01`;
}
