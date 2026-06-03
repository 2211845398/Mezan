import type { TFunction } from 'i18next';

import type { UnitOfMeasureRead } from '../api';

/** Larger packaging units have a higher rank (discrete category only). */
const PACKAGING_RANK: Record<string, number> = {
  PIECE: 1,
  BOX: 2,
  CARTON: 3,
  PALLET: 4,
};

export function packagingRank(uom: UnitOfMeasureRead): number {
  if (uom.measurement_category && uom.measurement_category !== 'discrete') {
    return 1;
  }
  return PACKAGING_RANK[uom.code] ?? 1;
}

export function localizedUomName(t: TFunction<'catalog'>, uom: UnitOfMeasureRead): string {
  const key = `products.uom_codes.${uom.code}.name`;
  const translated = t(key);
  return translated === key ? uom.name : translated;
}

export function localizedUomLabel(t: TFunction<'catalog'>, uom: UnitOfMeasureRead): string {
  const name = localizedUomName(t, uom);
  const symKey = `products.uom_codes.${uom.code}.symbol`;
  const symTranslated = t(symKey);
  const sym = symTranslated === symKey ? uom.symbol : symTranslated;
  if (sym === name) return name;
  return `${name} (${sym})`;
}

/** Intuitive display: 1 [larger unit] = factor [smaller / inventory unit]. */
export function getConversionHintUnits(
  base: UnitOfMeasureRead,
  alt: UnitOfMeasureRead,
  factor: string | number,
): { left: UnitOfMeasureRead; right: UnitOfMeasureRead; factor: string } | null {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return null;

  const altRank = packagingRank(alt);
  const baseRank = packagingRank(base);

  if (altRank >= baseRank) {
    return { left: alt, right: base, factor: String(f) };
  }
  return { left: base, right: alt, factor: String(f) };
}

export type UomRow = { uom_id: number; factor_to_base: string };

/** Display / form value: whole number only. */
export function formatConversionFactor(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.trunc(n));
}

/** Keep only positive integer digits while typing (rejects decimal fractions). */
export function parseConversionFactorInput(raw: string): string {
  const head = raw.trim().split(/[.,]/)[0] ?? '';
  const digits = head.replace(/\D/g, '');
  if (digits === '') return '';
  const n = parseInt(digits, 10);
  return n > 0 ? String(n) : '';
}

/**
 * Normalize to API semantics: `factor_to_base` = count of inventory (smallest) base units per 1 alternative unit.
 */
export function normalizeProductUomsForSave(
  baseUomId: number,
  alternatives: UomRow[],
  uoms: UnitOfMeasureRead[],
): { uom_id: number; alternative_uoms: UomRow[] } {
  const byId = new Map(uoms.map((u) => [u.id, u]));
  const formBase = byId.get(baseUomId);
  if (!formBase) {
    return { uom_id: baseUomId, alternative_uoms: alternatives };
  }

  const edges: Array<{ largerId: number; smallerId: number; factor: number }> = [];

  for (const row of alternatives) {
    if (row.uom_id <= 0) continue;
    const factor = Number(row.factor_to_base);
    if (!Number.isFinite(factor) || factor <= 0) continue;
    const alt = byId.get(row.uom_id);
    if (!alt) continue;

    const altRank = packagingRank(alt);
    const baseRank = packagingRank(formBase);

    if (altRank > baseRank) {
      edges.push({ largerId: alt.id, smallerId: formBase.id, factor });
    } else if (altRank < baseRank) {
      edges.push({ largerId: formBase.id, smallerId: alt.id, factor });
    } else {
      edges.push({ largerId: alt.id, smallerId: formBase.id, factor });
    }
  }

  if (edges.length === 0) {
    return { uom_id: baseUomId, alternative_uoms: [] };
  }

  const involvedIds = new Set<number>([formBase.id]);
  for (const row of alternatives) {
    if (row.uom_id > 0) involvedIds.add(row.uom_id);
  }

  let inventoryBaseId = formBase.id;
  let minRank = packagingRank(formBase);
  for (const id of involvedIds) {
    const u = byId.get(id);
    if (!u) continue;
    const r = packagingRank(u);
    if (r < minRank) {
      minRank = r;
      inventoryBaseId = id;
    }
  }

  const altMap = new Map<number, number>();
  for (const { largerId, smallerId, factor } of edges) {
    if (smallerId === inventoryBaseId) {
      altMap.set(largerId, factor);
    }
  }

  const alternative_uoms: UomRow[] = [...altMap.entries()]
    .filter(([id]) => id !== inventoryBaseId)
    .map(([uom_id, f]) => ({ uom_id, factor_to_base: String(f) }))
    .sort((a, b) => a.uom_id - b.uom_id);

  return { uom_id: inventoryBaseId, alternative_uoms };
}
