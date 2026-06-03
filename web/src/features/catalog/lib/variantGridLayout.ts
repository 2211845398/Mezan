/** Shared column widths and cell styles for active/archived variant tables. */

export const VARIANT_TABLE_MIN_WIDTH = 'min-w-[640px]';

export const variantGridTh = 'h-10 p-2 text-xs';
export const variantGridTd = 'min-w-0 p-2 align-middle';
export const variantGridInputCls = 'h-8 w-full min-w-0 px-2 text-xs';
export const variantGridReadOnlyCls = `${variantGridInputCls} bg-muted/40 cursor-default`;

/** Six columns: variant, system sku, reference code, barcode, price extra, action */
export const VARIANT_GRID_COL_WIDTHS = [
  'w-[26%]',
  'w-[22%]',
  'w-[12%]',
  'w-[14%]',
  'w-[9%]',
  'w-[9%]',
] as const;
