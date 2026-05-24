import type { ProductVariantPurchasingSearchItem } from '@/features/catalog/api';
import { purchasingVariantNameLabel } from '@/features/catalog/lib/purchasingVariantLabel';
import type { ProductUomOption } from '@/features/purchasing/lib/productUomOptions';
import { qtyToBaseUnits } from '@/lib/productUomQty';

export type DraftTransferLine = {
  product_id: number;
  variant_id: number | null;
  qty: number;
  qty_base: number;
  uom_id: number;
  uom_label: string;
  product_name: string;
  variant_name: string;
  reference_code: string;
  category_id: number;
};

export function draftLineFromSearchVariant(
  v: ProductVariantPurchasingSearchItem,
  qty: number,
  uomId: number,
  uomOptions: ProductUomOption[],
): DraftTransferLine {
  const uomOpt = uomOptions.find((o) => o.id === uomId);
  const qty_base = qtyToBaseUnits(qty, uomId, uomOptions);
  const ref = (v.reference_code ?? '').trim();
  return {
    product_id: v.product_id,
    variant_id: v.variant_id,
    qty,
    qty_base,
    uom_id: uomId,
    uom_label: uomOpt?.label ?? '',
    product_name: v.display_name.trim(),
    variant_name: purchasingVariantNameLabel(v),
    reference_code: ref,
    category_id: v.category_id,
  };
}

export function qtyBaseAlreadyForVariant(
  lines: DraftTransferLine[],
  variantId: number,
  excludeIndex?: number,
): number {
  return lines
    .filter((l, i) => l.variant_id === variantId && (excludeIndex === undefined || i !== excludeIndex))
    .reduce((s, l) => s + l.qty_base, 0);
}
