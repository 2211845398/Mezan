import type { TFunction } from 'i18next';

/** Map common DB/API unit symbols to catalog `uom_codes` keys. */
const SYMBOL_TO_UOM_CODE: Record<string, string> = {
  pcs: 'PIECE',
  piece: 'PIECE',
  pc: 'PIECE',
  box: 'BOX',
  carton: 'CARTON',
  pallet: 'PALLET',
  kg: 'KG',
  g: 'G',
  meter: 'METER',
  m: 'METER',
};

export function localizedPoLineUomDisplay(
  t: TFunction<'catalog'>,
  uomSymbol?: string | null,
  uomName?: string | null,
): string {
  const sym = (uomSymbol ?? '').trim();
  const name = (uomName ?? '').trim();
  const resolveCode = (raw: string): string | null => {
    const key = raw.trim();
    if (!key) return null;
    const lower = key.toLowerCase();
    return SYMBOL_TO_UOM_CODE[lower] ?? key.toUpperCase();
  };
  for (const candidate of [sym, name]) {
    const code = resolveCode(candidate);
    if (!code) continue;
    const symKey = `products.uom_codes.${code}.symbol`;
    const symTr = t(symKey);
    if (symTr !== symKey) return symTr;
    const nameKey = `products.uom_codes.${code}.name`;
    const nameTr = t(nameKey);
    if (nameTr !== nameKey) return nameTr;
  }
  if (name) return name;
  return sym;
}

export function formatPoLineQty(
  t: TFunction<'catalog'>,
  qty: number,
  uomSymbol?: string | null,
  uomName?: string | null,
): string {
  const unit = localizedPoLineUomDisplay(t, uomSymbol, uomName);
  if (!unit) return String(qty);
  return `${qty} ${unit}`;
}
