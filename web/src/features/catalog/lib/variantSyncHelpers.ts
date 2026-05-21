import type { VariantDraftRow, VariantPreviewRow } from '../api';
import type { VariantAxisLine } from './rebuildVariantAxes';

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
      sku: ex?.sku?.trim() ? ex.sku : pr.suggested_sku,
      barcode: ex?.barcode ?? '',
      active: ex?.active ?? true,
      price_extra: ex?.price_extra ?? '0',
      display_label: pr.display_label,
    };
  });
}
