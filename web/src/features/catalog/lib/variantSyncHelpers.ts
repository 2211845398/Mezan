import type {
  ProductWithVariantsVariantRow,
  VariantDraftRow,
  VariantPreviewRow,
} from '../api';
import type { VariantAxisLine } from './rebuildVariantAxes';

export function mapApiVariantsToDraft(
  variants: ProductWithVariantsVariantRow[],
): VariantDraftRow[] {
  return variants
    .filter((v) => {
      const av = v.attribute_values ?? {};
      return !av._default;
    })
    .map((v) => ({
      id: v.id,
      attribute_value_ids: v.attribute_value_ids ?? [],
      sku: v.sku,
      reference_code: v.reference_code?.trim() ?? '',
      barcode: v.barcode ?? '',
      active: v.active,
      price_extra: String(v.price_extra ?? '0'),
      display_label: v.display_label ?? v.sku,
    }));
}

export function variantComboKey(valueIds: number[]): string {
  return [...valueIds].sort((a, b) => a - b).join(',');
}

export function axesToPayload(axes: VariantAxisLine[]): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const line of axes) {
    if (line.attributeId > 0 && line.selectedValueIds.length > 0) {
      out[line.attributeId] = line.selectedValueIds;
    }
  }
  return out;
}

export function mergePreviewWithDraftRows(
  previewRows: VariantPreviewRow[],
  existing: VariantDraftRow[],
): VariantDraftRow[] {
  const byKey = new Map(
    existing.map((r) => [variantComboKey(r.attribute_value_ids), r]),
  );
  return previewRows.map((pr) => {
    const key = variantComboKey(pr.attribute_value_ids);
    const ex = byKey.get(key);
    return {
      id: ex?.id ?? null,
      attribute_value_ids: pr.attribute_value_ids,
      sku: pr.suggested_sku,
      reference_code: ex?.reference_code?.trim() ?? '',
      barcode: ex?.barcode ?? '',
      active: ex?.active ?? true,
      price_extra: ex?.price_extra ?? '0',
      display_label: pr.display_label,
    };
  });
}
