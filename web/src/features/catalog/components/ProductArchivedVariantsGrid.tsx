import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { VariantDraftRow } from '../api';
import {
  VARIANT_GRID_COL_WIDTHS,
  VARIANT_TABLE_MIN_WIDTH,
  variantGridReadOnlyCls,
  variantGridTd,
  variantGridTh,
} from '../lib/variantGridLayout';

type Props = {
  rows: VariantDraftRow[];
  disabled?: boolean | undefined;
  onReactivate: (variantId: number) => void;
};

function VariantGridColgroup() {
  return (
    <colgroup>
      {VARIANT_GRID_COL_WIDTHS.map((w, i) => (
        <col key={i} className={w} />
      ))}
    </colgroup>
  );
}

/** Archived variant rows only (no collapsible trigger — parent owns toolbar toggle). */
export function ProductArchivedVariantsGrid({ rows, disabled, onReactivate }: Props) {
  const { t } = useTranslation('catalog');

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-md border">
        <Table
          containerClassName="overflow-x-auto"
          className={`w-full table-fixed ${VARIANT_TABLE_MIN_WIDTH}`}
        >
          <VariantGridColgroup />
          <TableHeader>
            <TableRow>
              <TableHead className={variantGridTh}>{t('products.variants.col.variant')}</TableHead>
              <TableHead className={variantGridTh}>{t('products.variants.col.system_sku')}</TableHead>
              <TableHead className={variantGridTh}>{t('products.variants.col.reference_code')}</TableHead>
              <TableHead className={variantGridTh}>{t('products.variants.col.barcode')}</TableHead>
              <TableHead className={variantGridTh} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id ?? row.sku}>
                <TableCell className={variantGridTd} title={row.display_label}>
                  <span className="block truncate text-sm text-muted-foreground">
                    {row.display_label}
                  </span>
                </TableCell>
                <TableCell className={variantGridTd}>
                  <Input
                    className={`${variantGridReadOnlyCls} font-mono`}
                    dir="ltr"
                    value={row.sku}
                    readOnly
                    disabled
                  />
                </TableCell>
                <TableCell className={variantGridTd}>
                  <Input
                    className={`${variantGridReadOnlyCls} font-mono`}
                    dir="ltr"
                    value={row.reference_code || '—'}
                    readOnly
                    disabled
                  />
                </TableCell>
                <TableCell className={variantGridTd}>
                  <Input
                    className={`${variantGridReadOnlyCls} font-mono`}
                    dir="ltr"
                    value={row.barcode || '—'}
                    readOnly
                    disabled
                  />
                </TableCell>
                <TableCell className={variantGridTd}>
                  {row.id != null ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      disabled={disabled}
                      onClick={() => onReactivate(row.id!)}
                    >
                      <RotateCcw className="h-4 w-4 shrink-0" />
                      {t('products.variants.reactivate')}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
