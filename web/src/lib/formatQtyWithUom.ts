/** Display quantity with unit symbol, e.g. `5 pcs`. */
export function formatQtyWithUom(qty: number | string, uomSymbol?: string | null): string {
  const n = typeof qty === 'string' ? Number(qty) : qty;
  const q = Number.isFinite(n) ? n : 0;
  const sym = (uomSymbol ?? '').trim();
  if (!sym) return String(q);
  return `${q} ${sym}`;
}
