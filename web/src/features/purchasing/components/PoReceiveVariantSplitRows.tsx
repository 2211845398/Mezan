import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { computeReceiveLineProgress } from '../lib/receiveLineProgress';
import PoReceiveLineRow from './PoReceiveLineRow';
import ReceiveUnitCostHint from './ReceiveUnitCostHint';
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
  disabled?: boolean | undefined;
  uomDisplay: string;
  uomId: number;
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
  uomDisplay,
  uomId,
}: Props) {
  const { t } = useTranslation('purchasing');
  const { t: tInv } = useTranslation('inventory');

  const allocated = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const progress = computeReceiveLineProgress(ordered, alreadyReceived, allocated);

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">{productLabel}</p>
      {rows.map((row, idx) => (
        <PoReceiveLineRow
          key={row.key}
          variant={
            <PoReceiveVariantSelect
              nameOnly
              receiveLabel
              productId={productId}
              value={row.variant_id > 0 ? String(row.variant_id) : ''}
              disabled={disabled}
              title={row.pick_label || undefined}
              onChange={(variantId, label) => {
                onChange(
                  rows.map((r, i) =>
                    i === idx ? { ...r, variant_id: variantId, pick_label: label } : r,
                  ),
                );
              }}
            />
          }
          uomDisplay={uomDisplay}
          qty={row.qty}
          unitCost={row.unit_cost}
          unitCostLabel={tInv('movement.receipt.unit_cost_per_uom', { uom: uomDisplay })}
          unitCostFooter={
            <ReceiveUnitCostHint productId={productId} uomId={uomId} unitCost={row.unit_cost} />
          }
          qtyMax={remaining}
          disabled={disabled}
          onQtyChange={(v) => {
            onChange(rows.map((r, i) => (i === idx ? { ...r, qty: v } : r)));
          }}
          onUnitCostChange={(v) => {
            onChange(rows.map((r, i) => (i === idx ? { ...r, unit_cost: v } : r)));
          }}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              aria-label="remove"
            >
              <Trash2 className="size-4" />
            </Button>
          }
        />
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
