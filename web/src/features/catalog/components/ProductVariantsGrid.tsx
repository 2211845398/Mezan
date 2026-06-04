import { Archive } from 'lucide-react';
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
  variantGridInputCls,
  variantGridReadOnlyCls,
  variantGridTd,
  variantGridTh,
} from '../lib/variantGridLayout';

type Props = {
  rows: VariantDraftRow[];
  productName: string;
  disabled?: boolean | undefined;
  onRowsChange: (rows: VariantDraftRow[]) => void;
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

export function ProductVariantsGrid({ rows, productName, disabled, onRowsChange }: Props) {
  const { t } = useTranslation('catalog');

  const patchRow = (index: number, patch: Partial<VariantDraftRow>) => {
    onRowsChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const archiveRow = (index: number) => {
    onRowsChange(rows.map((r, i) => (i === index ? { ...r, active: false } : r)));
  };

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t('products.variants.grid_empty')}</p>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="w-full max-w-full overflow-hidden rounded-md border">
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
            {rows.map((row, idx) => {
              const label = row.display_label || productName;
              return (
                <TableRow key={row.id ?? `${row.sku}-${idx}`}>
                  <TableCell className={variantGridTd} title={label}>
                    <span className="block truncate text-sm">{label}</span>
                  </TableCell>
                  <TableCell className={variantGridTd}>
                    <Input
                      className={`${variantGridReadOnlyCls} font-mono`}
                      dir="ltr"
                      value={row.sku}
                      readOnly
                      disabled={disabled}
                    />
                  </TableCell>
                  <TableCell className={variantGridTd}>
                    <Input
                      className={`${variantGridInputCls} font-mono`}
                      dir="ltr"
                      value={row.reference_code}
                      disabled={disabled}
                      onChange={(e) => patchRow(idx, { reference_code: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className={variantGridTd}>
                    <Input
                      className={`${variantGridReadOnlyCls} font-mono`}
                      dir="ltr"
                      value={row.barcode}
                      readOnly
                      disabled={disabled}
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className={variantGridTd}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={disabled}
                      onClick={() => archiveRow(idx)}
                      aria-label={t('products.variants.archive')}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
