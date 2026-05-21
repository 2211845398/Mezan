import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { computeReceiveLineProgress } from '../lib/receiveLineProgress';
import ReceiveLineProgressHint from './ReceiveLineProgressHint';
import PoReceiveVariantSelect from './PoReceiveVariantSelect';

export type ReceiveSplitRow = {
  key: string;
  variant_id: number;
  qty: string;
  unit_cost: string;
  pick_label: string;
};

type Props = {
  productId: number;
  productLabel: string;
  ordered: number;
  alreadyReceived: number;
  remaining: number;
  rows: ReceiveSplitRow[];
  onChange: (rows: ReceiveSplitRow[]) => void;
  disabled?: boolean;
};

export function newReceiveSplitRow(): ReceiveSplitRow {
  return { key: crypto.randomUUID(), variant_id: 0, qty: '', unit_cost: '', pick_label: '' };
}

export default function PoReceiveVariantSplitRows({
  productId,
  productLabel,
  ordered,
  alreadyReceived,
  remaining,
  rows,
  onChange,
  disabled,
}: Props) {
  const { t } = useTranslation('purchasing');

  const allocated = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const progress = computeReceiveLineProgress(ordered, alreadyReceived, allocated);

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">{productLabel}</p>
      {rows.map((row, idx) => (
        <div key={row.key} className="grid gap-2 md:grid-cols-12 md:items-end">
          <div className="md:col-span-5">
            <Label>{t('orders.receive.variant')}</Label>
            <PoReceiveVariantSelect
              productId={productId}
              value={row.variant_id > 0 ? String(row.variant_id) : ''}
              disabled={disabled}
              onChange={(variantId, label) => {
                onChange(
                  rows.map((r, i) =>
                    i === idx ? { ...r, variant_id: variantId, pick_label: label } : r,
                  ),
                );
              }}
            />
          </div>
          <div className="md:col-span-3">
            <Label>{t('orders.receive.qty')}</Label>
            <Input
              type="number"
              min={0}
              max={remaining}
              disabled={disabled}
              value={row.qty}
              onChange={(e) => {
                onChange(rows.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)));
              }}
            />
          </div>
          <div className="md:col-span-3">
            <Label>{t('orders.receive.unit_cost')}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={row.unit_cost}
              onChange={(e) => {
                onChange(rows.map((r, i) => (i === idx ? { ...r, unit_cost: e.target.value } : r)));
              }}
            />
          </div>
          <div className="flex md:col-span-1 md:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              aria-label="remove"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <ReceiveLineProgressHint progress={progress} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...rows, newReceiveSplitRow()])}
      >
        <Plus className="me-2 size-4" />
        {t('orders.receive.add_split')}
      </Button>
    </div>
  );
}
