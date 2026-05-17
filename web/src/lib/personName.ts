/** Join person name parts for display (Arabic: اسم أول · اسم الأب · اللقب). */
export function formatPersonName(
  first: string | null | undefined,
  father: string | null | undefined,
  family: string | null | undefined,
): string {
  const parts = [first, father, family]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0);
  return parts.join(' ');
}
