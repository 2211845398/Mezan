import type { TFunction } from 'i18next';

import type { ProductVariantPurchasingSearchItem } from '@/features/catalog/api';
import { purchasingVariantNameLabel } from '@/features/catalog/lib/purchasingVariantLabel';
import type { TransferLineRead } from '@/features/inventory/types';
import { localizedPoLineUomDisplay } from '@/features/purchasing/lib/poLineUomDisplay';
import type { ProductUomOption } from '@/features/purchasing/lib/productUomOptions';
import { qtyToBaseUnits } from '@/lib/productUomQty';

export type DraftTransferLine = {
  product_id: number;
  variant_id: number | null;
  qty: number;
  qty_base: number;
  uom_id: number;
  uom_label: string;
  uom_symbol?: string;
  uom_name?: string;
  product_name: string;
  variant_name: string;
  reference_code: string;
  category_id: number;
  product_image_url?: string | null;
};

export type DraftLineDisplayNames = {
  product_name?: string;
  variant_name?: string;
};

export function draftLineFromSearchVariant(
  v: ProductVariantPurchasingSearchItem,
  qty: number,
  uomId: number,
  uomOptions: ProductUomOption[],
  display?: DraftLineDisplayNames,
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
    product_name: display?.product_name?.trim() || v.display_name.trim(),
    variant_name: display?.variant_name?.trim() || purchasingVariantNameLabel(v),
    reference_code: ref,
    category_id: v.category_id,
  };
}

/** Build draft line from product + variant picks (same catalog hit as PO lines). */
export function draftLineFromProductVariant(
  v: ProductVariantPurchasingSearchItem,
  qty: number,
  uomId: number,
  uomOptions: ProductUomOption[],
  productPickLabel: string,
  variantPickLabel: string,
): DraftTransferLine {
  return draftLineFromSearchVariant(v, qty, uomId, uomOptions, {
    product_name: productPickLabel,
    variant_name: variantPickLabel,
  });
}

export function draftLineFromBatchLine(
  ln: TransferLineRead,
  tCatalog?: TFunction<'catalog'>,
): DraftTransferLine {
  const sym = (ln.uom_symbol ?? '').trim();
  const name = (ln.uom_name ?? '').trim();
  const uomLabel = tCatalog
    ? localizedPoLineUomDisplay(tCatalog, sym || null, name || null)
    : sym && name && sym !== name
      ? `${name} (${sym})`
      : name || sym;
  const variantName =
    (ln.variant_name ?? '').trim() ||
    (ln.variant_attributes ?? '').trim() ||
    (ln.variant_sku ?? '').trim();
  return {
    product_id: ln.product_id,
    variant_id: ln.variant_id ?? null,
    qty: ln.qty,
    qty_base: ln.qty_base ?? ln.qty,
    uom_id: ln.uom_id ?? 0,
    uom_label: uomLabel,
    uom_symbol: sym,
    uom_name: name,
    product_name: (ln.product_name ?? '').trim() || `#${ln.product_id}`,
    variant_name: variantName,
    reference_code: (ln.reference_code ?? '').trim(),
    category_id: 0,
  };
}

export function draftLineUomDisplay(
  tCatalog: TFunction<'catalog'>,
  line: DraftTransferLine,
): string {
  const localized = localizedPoLineUomDisplay(tCatalog, line.uom_symbol, line.uom_name);
  return localized || line.uom_label || '—';
}

export function draftLineVariantDisplay(line: DraftTransferLine): string {
  return line.variant_name?.trim() || '—';
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
