import type { TFunction } from 'i18next';

import { getProduct } from '@/features/catalog/api';
import { buildProductUomOptions } from '@/features/purchasing/lib/productUomOptions';
import { qtyToBaseUnits } from '@/lib/productUomQty';

import type { DraftTransferLine } from './transferDraft';

export type TransferRestockPrefillLine = {
  product_id: number;
  variant_id: number;
  qty: number;
  uom_id: number;
  product_name: string;
  variant_name: string;
  reference_code?: string;
  product_image_url?: string | null;
};

export type TransferRestockPrefill = {
  from_branch_id: number;
  to_branch_id: number;
  lines: TransferRestockPrefillLine[];
};

export function isTransferRestockPrefill(value: unknown): value is TransferRestockPrefill {
  if (!value || typeof value !== 'object') return false;
  const v = value as TransferRestockPrefill;
  return (
    Number.isFinite(v.from_branch_id) &&
    Number.isFinite(v.to_branch_id) &&
    Array.isArray(v.lines) &&
    v.lines.length > 0
  );
}

export function draftLineFromRestockPrefillLine(line: TransferRestockPrefillLine): DraftTransferLine {
  return {
    product_id: line.product_id,
    variant_id: line.variant_id,
    qty: line.qty,
    qty_base: line.qty,
    uom_id: line.uom_id,
    uom_label: '',
    product_name: line.product_name,
    variant_name: line.variant_name,
    reference_code: line.reference_code?.trim() ?? '',
    category_id: 0,
    product_image_url: line.product_image_url ?? null,
  };
}

export async function hydrateDraftLineUom(
  tCatalog: TFunction<'catalog'>,
  line: DraftTransferLine,
): Promise<DraftTransferLine> {
  const product = await getProduct(line.product_id);
  const uomOptions = buildProductUomOptions(tCatalog, product);
  const uomId =
    line.uom_id > 0 && uomOptions.some((o) => o.id === line.uom_id)
      ? line.uom_id
      : (product.uom_id ?? uomOptions[0]?.id ?? 0);
  const uomOpt = uomOptions.find((o) => o.id === uomId);
  const qty_base = qtyToBaseUnits(line.qty, uomId, uomOptions);
  let uom_symbol = product.uom_symbol ?? undefined;
  let uom_name = product.uom_name ?? undefined;
  if (uomId !== product.uom_id) {
    const alt = product.alternative_uoms?.find((a) => a.uom_id === uomId);
    if (alt) {
      uom_symbol = alt.uom_symbol;
      uom_name = alt.uom_name;
    }
  }
  return {
    ...line,
    uom_id: uomId,
    uom_label: uomOpt?.label ?? '',
    uom_symbol,
    uom_name,
    qty_base,
    product_image_url: line.product_image_url ?? product.image_url ?? null,
  };
}
