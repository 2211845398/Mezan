import type { CategoryAttrDef, ProductVariantPurchasingSearchItem, ProductWithVariantsVariantRow } from '@/features/catalog/api';

export type DraftTransferLine = {
  product_id: number;
  variant_id: number | null;
  qty: number;
  product_name: string;
  variant_sku: string;
  variant_attributes: string;
  category_id: number;
  attribute_values: Record<string, string>;
};

export function stringRecordFromUnknownValues(
  src: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!src) return out;
  for (const [k, v] of Object.entries(src)) {
    if (v == null) continue;
    out[k] = String(v).trim();
  }
  return out;
}

export function draftLineFromSearchVariant(v: ProductVariantPurchasingSearchItem, qty: number): DraftTransferLine {
  const attribute_values = stringRecordFromUnknownValues(
    v.attribute_values as Record<string, unknown> | null | undefined,
  );
  return {
    product_id: v.product_id,
    variant_id: v.variant_id,
    qty,
    product_name: v.display_name.trim(),
    variant_sku: v.sku.trim(),
    variant_attributes: (v.variant_attributes ?? '').trim(),
    category_id: v.category_id,
    attribute_values,
  };
}

export function formatAttributeSummary(defs: CategoryAttrDef[], ui: Record<string, string>): string {
  const sorted = defs
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.key.localeCompare(b.key));
  const parts: string[] = [];
  for (const d of sorted) {
    const val = (ui[d.key] ?? '').trim();
    if (val) parts.push(`${d.label}: ${val}`);
  }
  return parts.join(' · ');
}

function sortedDefs(defs: CategoryAttrDef[]): CategoryAttrDef[] {
  return defs.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.key.localeCompare(b.key));
}

/** When category has variant attribute definitions: match exactly one active variant, or null. */
export function resolveVariantFromAttributes(
  variants: ProductWithVariantsVariantRow[],
  ui: Record<string, string>,
  defs: CategoryAttrDef[],
): ProductWithVariantsVariantRow | null {
  if (!variants.length || !defs.length) return null;

  const defsSorted = sortedDefs(defs);

  for (const def of defsSorted) {
    if (def.required && !(ui[def.key] ?? '').trim()) {
      return null;
    }
  }

  const active = variants.filter((v) => v.active !== false);
  const candidates = active.filter((v) => {
    const av = (v.attribute_values ?? {}) as Record<string, unknown>;
    for (const def of defsSorted) {
      const uiVal = (ui[def.key] ?? '').trim();
      if (!uiVal) continue;
      const vv = av[def.key];
      const stored = vv == null ? '' : String(vv).trim();
      if (stored !== uiVal) return false;
    }
    return true;
  });

  return candidates.length === 1 ? candidates[0]! : null;
}

export function qtyAlreadyForVariant(lines: DraftTransferLine[], variantId: number, excludeIndex?: number): number {
  return lines
    .filter((l, i) => l.variant_id === variantId && (excludeIndex === undefined || i !== excludeIndex))
    .reduce((s, l) => s + l.qty, 0);
}
