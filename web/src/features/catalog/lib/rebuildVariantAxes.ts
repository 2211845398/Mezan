import type { CatalogAttributeValueRead } from '../api';

export type VariantAxisLine = {
  attributeId: number;
  selectedValueIds: number[];
};

/** Map value ids → attribute ids, then merge into axis lines. */
export function rebuildAxesFromValueIds(
  valueIds: number[],
  valueIndex: Map<number, CatalogAttributeValueRead>,
): VariantAxisLine[] {
  const byAttr = new Map<number, Set<number>>();
  for (const vid of valueIds) {
    const row = valueIndex.get(vid);
    if (!row) {
      continue;
    }
    const aid = row.attribute_id;
    if (!byAttr.has(aid)) {
      byAttr.set(aid, new Set());
    }
    byAttr.get(aid)!.add(vid);
  }
  return [...byAttr.entries()].map(([attributeId, set]) => ({
    attributeId,
    selectedValueIds: [...set].sort((a, b) => a - b),
  }));
}
