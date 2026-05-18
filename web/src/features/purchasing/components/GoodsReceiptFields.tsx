import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BranchRead } from '@/features/admin/types';
import { newIdempotencyKey } from '@/lib/idempotency';

import { type PurchaseOrderRead, receiveGoodsForPurchaseOrder } from '../api';
import { aggregateReceivedQtyByPoLine } from '../lib/aggregateReceivedQtyByPoLine';
import { purchasingKeys } from '../queries';
import PoReceiveVariantSplitRows, {
  type ReceiveSplitRow,
  newReceiveSplitRow,
} from './PoReceiveVariantSplitRows';

type Props = {
  purchaseOrder: PurchaseOrderRead;
  receipts: import('../api').GoodsReceiptRead[];
  branches: BranchRead[];
  productLabels: Record<number, string>;
  onPosted?: () => void | Promise<void>;
  disabled?: boolean;
};

export default function GoodsReceiptFields({
  purchaseOrder: po,
  receipts,
  branches,
  productLabels,
  onPosted,
  disabled,
}: Props) {
  const { t } = useTranslation('purchasing');
  const qc = useQueryClient();
  const receivedByLine = useMemo(() => aggregateReceivedQtyByPoLine(receipts), [receipts]);

  const [recvBranch, setRecvBranch] = useState('');
  const [recvQty, setRecvQty] = useState<Record<number, string>>({});
  const [recvUnitCost, setRecvUnitCost] = useState<Record<number, string>>({});
  const [splitsByLine, setSplitsByLine] = useState<Record<number, ReceiveSplitRow[]>>({});
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    idempotencyKeyRef.current = newIdempotencyKey();
    if (po.branch_id != null) {
      setRecvBranch(String(po.branch_id));
    }
    const qtyInit: Record<number, string> = {};
    const costInit: Record<number, string> = {};
    const splitInit: Record<number, ReceiveSplitRow[]> = {};
    for (const ln of po.lines ?? []) {
      const rem = Math.max(0, ln.qty - (receivedByLine[ln.id] ?? 0));
      if (ln.variant_id != null && ln.variant_id > 0) {
        qtyInit[ln.id] = rem > 0 ? String(rem) : '';
        costInit[ln.id] = ln.unit_cost != null ? String(ln.unit_cost) : '';
      } else if (rem > 0) {
        splitInit[ln.id] = [newReceiveSplitRow()];
      }
    }
    setRecvQty(qtyInit);
    setRecvUnitCost(costInit);
    setSplitsByLine(splitInit);
  }, [po.branch_id, po.lines, receivedByLine]);

  const receiveM = useMutation({
    mutationFn: async () => {
      const branch_id = Number(recvBranch);
      const lines: Array<{
        purchase_order_line_id: number;
        qty: number;
        unit_cost: string;
        variant_id?: number;
      }> = [];

      for (const ln of po.lines ?? []) {
        const already = receivedByLine[ln.id] ?? 0;
        const remaining = Math.max(0, ln.qty - already);
        if (remaining <= 0) {
          continue;
        }

        if (ln.variant_id != null && ln.variant_id > 0) {
          const qty = Number(recvQty[ln.id] ?? 0);
          const unit_cost = recvUnitCost[ln.id] ?? '';
          if (qty > 0) {
            lines.push({
              purchase_order_line_id: ln.id,
              qty,
              unit_cost: String(Number(unit_cost)),
              variant_id: ln.variant_id,
            });
          }
          continue;
        }

        const splits = splitsByLine[ln.id] ?? [];
        for (const row of splits) {
          const qty = Number(row.qty);
          const unit_cost = row.unit_cost;
          if (qty > 0 && row.variant_id > 0 && Number(unit_cost) > 0) {
            lines.push({
              purchase_order_line_id: ln.id,
              qty,
              unit_cost: String(Number(unit_cost)),
              variant_id: row.variant_id,
            });
          }
        }
      }

      if (!branch_id || lines.length === 0) {
        throw new Error('branch and qty');
      }

      const idem = idempotencyKeyRef.current ?? newIdempotencyKey();
      idempotencyKeyRef.current = idem;
      return receiveGoodsForPurchaseOrder(po.id, {
        branch_id,
        lines,
        idempotency_key: idem,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('orders.detail_page.receipt_ok'));
      await onPosted?.();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const handleSubmit = () => {
    for (const ln of po.lines ?? []) {
      if (ln.variant_id != null && ln.variant_id > 0) {
        const already = receivedByLine[ln.id] ?? 0;
        const remaining = Math.max(0, ln.qty - already);
        const qty = Number(recvQty[ln.id] ?? 0);
        const cost = Number(recvUnitCost[ln.id] ?? 0);
        if (qty > 0 && !(cost > 0)) {
          toast.error(t('orders.receive.unit_cost_required'));
          return;
        }
        continue;
      }
      const already = receivedByLine[ln.id] ?? 0;
      const remaining = Math.max(0, ln.qty - already);
      if (remaining <= 0) {
        continue;
      }
      const splits = splitsByLine[ln.id] ?? [];
      const allocated = splits.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      if (allocated > remaining) {
        toast.error(t('orders.receive.split_exceeds_remaining'));
        return;
      }
      const hasValid = splits.some(
        (r) => Number(r.qty) > 0 && r.variant_id > 0 && Number(r.unit_cost) > 0,
      );
      if (!hasValid && remaining > 0) {
        toast.error(t('orders.receive.variant_required'));
        return;
      }
    }
    void receiveM.mutate();
  };

  const pending = disabled || receiveM.isPending;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 md:max-w-sm">
        <Label>{t('orders.receive.branch')}</Label>
        <Select
          value={recvBranch || '__'}
          onValueChange={(v) => setRecvBranch(v === '__' ? '' : v)}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__">—</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(po.lines ?? []).map((ln) => {
        const already = receivedByLine[ln.id] ?? 0;
        const remaining = Math.max(0, ln.qty - already);
        if (remaining <= 0) {
          return null;
        }
        const label = productLabels[ln.product_id] ?? `#${ln.product_id}`;

        if (ln.variant_id != null && ln.variant_id > 0) {
          return (
            <div key={ln.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-2">
              <div>
                <Label>
                  {label} — {t('orders.receive.qty')} ({t('orders.detail_page.remaining')}: {remaining})
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={remaining}
                  disabled={pending}
                  value={recvQty[ln.id] ?? ''}
                  onChange={(e) => setRecvQty((prev) => ({ ...prev, [ln.id]: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('orders.receive.unit_cost')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={pending}
                  value={recvUnitCost[ln.id] ?? ''}
                  onChange={(e) => setRecvUnitCost((prev) => ({ ...prev, [ln.id]: e.target.value }))}
                />
              </div>
            </div>
          );
        }

        return (
          <PoReceiveVariantSplitRows
            key={ln.id}
            productId={ln.product_id}
            productLabel={label}
            remaining={remaining}
            rows={splitsByLine[ln.id] ?? []}
            disabled={pending}
            onChange={(rows) => setSplitsByLine((prev) => ({ ...prev, [ln.id]: rows }))}
          />
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={handleSubmit}>
          {t('orders.receive.submit')}
        </Button>
      </div>
    </div>
  );
}
