import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { VariantDraftRow } from '../api';

type Props = {
  rows: VariantDraftRow[];
  productName: string;
  disabled?: boolean | undefined;
  onRowsChange: (rows: VariantDraftRow[]) => void;
};

export function ProductVariantsGrid({ rows, productName, disabled, onRowsChange }: Props) {
  const { t } = useTranslation('catalog');

  const patchRow = (index: number, patch: Partial<VariantDraftRow>) => {
    onRowsChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    onRowsChange(rows.filter((_, i) => i !== index));
  };

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t('products.variants.grid_empty')}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('products.variants.col.variant')}</TableHead>
            <TableHead>{t('products.variants.col.sku')}</TableHead>
            <TableHead>{t('products.variants.col.barcode')}</TableHead>
            <TableHead>{t('products.variants.col.price_extra')}</TableHead>
            <TableHead className="w-20">{t('products.variants.col.active')}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={row.id ?? `${row.sku}-${idx}`}>
              <TableCell className="text-sm">{row.display_label || productName}</TableCell>
              <TableCell>
                <Input
                  className="h-8 font-mono text-xs"
                  value={row.sku}
                  disabled={disabled}
                  onChange={(e) => patchRow(idx, { sku: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-8 font-mono text-xs"
                  value={row.barcode}
                  disabled={disabled}
                  placeholder="—"
                  autoComplete="off"
                  onChange={(e) => patchRow(idx, { barcode: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-8 num-latin text-xs"
                  dir="ltr"
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.price_extra}
                  disabled={disabled}
                  onChange={(e) => patchRow(idx, { price_extra: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Switch
                  checked={row.active}
                  disabled={disabled}
                  onCheckedChange={(active) => patchRow(idx, { active })}
                />
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={disabled}
                  onClick={() => removeRow(idx)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
