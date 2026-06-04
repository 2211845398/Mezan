import type { TFunction } from 'i18next';

/** Map UoM code/symbol to localized catalog label (e.g. pcs → قطعة). */
export function localizedUomLabel(
  codeOrSymbol: string | null | undefined,
  t: TFunction,
): string {
  const raw = (codeOrSymbol ?? '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const aliasToCode: Record<string, string> = {
    pcs: 'PIECE',
    pc: 'PIECE',
    piece: 'PIECE',
    pieces: 'PIECE',
    box: 'BOX',
    kg: 'KG',
    kilogram: 'KG',
    l: 'LITER',
    liter: 'LITER',
    litre: 'LITER',
    m: 'METER',
    meter: 'METER',
    metre: 'METER',
  };

  const code = aliasToCode[lower] ?? raw.toUpperCase();
  const key = `products.uom_codes.${code}.symbol`;
  const translated = t(key, { defaultValue: '' });
  if (translated) return translated;

  const nameKey = `products.uom_codes.${code}.name`;
  const nameTranslated = t(nameKey, { defaultValue: '' });
  return nameTranslated || raw;
}

/** Display quantity with localized unit, e.g. `5 قطعة`. */
export function formatQtyWithLocalizedUom(
  qty: number | string,
  uomCodeOrSymbol: string | null | undefined,
  t: TFunction,
): string {
  const n = typeof qty === 'string' ? Number(qty) : qty;
  const q = Number.isFinite(n) ? n : 0;
  const sym = localizedUomLabel(uomCodeOrSymbol, t);
  if (!sym) return String(q);
  return `${q} ${sym}`;
}
