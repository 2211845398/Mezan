import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { BranchRead } from '@/features/admin/types';
import { newIdempotencyKey } from '@/lib/idempotency';

import {
  type PurchaseOrderLineRead,
  type PurchaseOrderRead,
  receiveGoodsForPurchaseOrder,
} from '../api';
import { aggregateReceivedQtyByPoLine } from '../lib/aggregateReceivedQtyByPoLine';
import { localizedPoLineUomDisplay } from '../lib/poLineUomDisplay';
import { canonicalReceiveUnitCost, isPositiveReceiveUnitCost } from '../lib/receiveUnitCost';
import { computeReceiveLineProgress } from '../lib/receiveLineProgress';
import ReceiveLineProgressHint from './ReceiveLineProgressHint';
import { purchasingKeys } from '../queries';
import PoReceiveLineRow from './PoReceiveLineRow';
import ReceiveUnitCostHint from './ReceiveUnitCostHint';
import ReceiveLineReadonlyValue from './ReceiveLineReadonlyValue';
import PoReceiveVariantSplitRows, {
  type ReceiveSplitRow,
  newReceiveSplitRow,
} from './PoReceiveVariantSplitRows';

type Props = {
  purchaseOrder: PurchaseOrderRead;
  receipts: import('../api').GoodsReceiptRead[];
  branches: BranchRead[];
  productLabels: Record<number, string>;
  variantLabels?: Record<number, string>;
  onPosted?: () => void | Promise<void>;
  disabled?: boolean;
};

export default function GoodsReceiptFields({
  purchaseOrder: po,
  receipts,
  branches,
  productLabels,
  variantLabels = {},
  onPosted,
  disabled,
}: Props) {
  const { t } = useTranslation('purchasing');
  const { t: tInv } = useTranslation('inventory');
  const { t: tCatalog } = useTranslation('catalog');
  const qc = useQueryClient();
  const receivedByLine = useMemo(() => aggregateReceivedQtyByPoLine(receipts), [receipts]);

  const recvBranchDisplay = useMemo(() => {
    if (po.branch_id == null) return '—';
    return branches.find((b) => b.id === po.branch_id)?.name ?? `#${po.branch_id}`;
  }, [branches, po.branch_id]);
  const [recvQty, setRecvQty] = useState<Record<number, string>>({});
  const [recvUnitCost, setRecvUnitCost] = useState<Record<number, string>>({});
  const [splitsByLine, setSplitsByLine] = useState<Record<number, ReceiveSplitRow[]>>({});
  const [receiptNotes, setReceiptNotes] = useState('');
  const idempotencyKeyRef = useRef<string | null>(null);

  const lineUomDisplay = (ln: PurchaseOrderLineRead) =>
    localizedPoLineUomDisplay(tCatalog, ln.uom_symbol, ln.uom_name);

  useEffect(() => {
    idempotencyKeyRef.current = newIdempotencyKey();
    const qtyInit: Record<number, string> = {};
    const costInit: Record<number, string> = {};
    const splitInit: Record<number, ReceiveSplitRow[]> = {};
    for (const ln of po.lines ?? []) {
      const rem = Math.max(0, ln.qty - (receivedByLine[ln.id] ?? 0));
      if (ln.variant_id != null && ln.variant_id > 0) {
        qtyInit[ln.id] = '';
        costInit[ln.id] = '';
      } else if (rem > 0) {
        splitInit[ln.id] = [newReceiveSplitRow()];
      }
    }
    setRecvQty(qtyInit);
    setRecvUnitCost(costInit);
    setSplitsByLine(splitInit);
  }, [po.lines, receivedByLine]);

  const receiveM = useMutation({
    mutationFn: async () => {
      const branch_id = po.branch_id ?? 0;
      if (branch_id <= 0) {
        throw new Error('missing_po_branch');
      }
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
              unit_cost: canonicalReceiveUnitCost(unit_cost),
              variant_id: ln.variant_id,
            });
          }
          continue;
        }

        const splits = splitsByLine[ln.id] ?? [];
        for (const row of splits) {
          const qty = Number(row.qty);
          const unit_cost = row.unit_cost;
          if (qty > 0 && row.variant_id > 0 && isPositiveReceiveUnitCost(unit_cost)) {
            lines.push({
              purchase_order_line_id: ln.id,
              qty,
              unit_cost: canonicalReceiveUnitCost(unit_cost),
              variant_id: row.variant_id,
            });
          }
        }
      }

      if (!branch_id || lines.length === 0) {
        toast.error(t('orders.receive.no_lines'));
        throw new Error('branch and qty');
      }

      const idem = idempotencyKeyRef.current ?? newIdempotencyKey();
      idempotencyKeyRef.current = idem;
      const notes = receiptNotes.trim() || null;
      return receiveGoodsForPurchaseOrder(po.id, {
        branch_id,
        lines,
        idempotency_key: idem,
        notes,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      idempotencyKeyRef.current = newIdempotencyKey();
      setReceiptNotes('');
      toast.success(t('orders.detail_page.receipt_ok'));
      await onPosted?.();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const handleSubmit = () => {
    for (const ln of po.lines ?? []) {
      if (ln.variant_id != null && ln.variant_id > 0) {
        const qty = Number(recvQty[ln.id] ?? 0);
        const costRaw = recvUnitCost[ln.id] ?? '';
        if (qty > 0 && !isPositiveReceiveUnitCost(costRaw)) {
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
        (r) =>
          Number(r.qty) > 0 && r.variant_id > 0 && isPositiveReceiveUnitCost(r.unit_cost),
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
        <div
          className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm"
          aria-readonly
        >
          {recvBranchDisplay}
        </div>
      </div>

      {(po.lines ?? []).map((ln) => {
        const already = receivedByLine[ln.id] ?? 0;
        const remaining = Math.max(0, ln.qty - already);
        if (remaining <= 0) {
          return null;
        }
        const label = productLabels[ln.product_id] ?? `#${ln.product_id}`;
        const uomDisplay = lineUomDisplay(ln);

        if (ln.variant_id != null && ln.variant_id > 0) {
          const sessionQty = Number(recvQty[ln.id] ?? 0);
          const progress = computeReceiveLineProgress(ln.qty, already, sessionQty);
          const variantText =
            variantLabels[ln.variant_id] || `#${ln.variant_id}`;
          return (
            <div key={ln.id} className="grid gap-3 rounded-md border p-3">
              <p className="text-sm font-medium">{label}</p>
              <PoReceiveLineRow
                variant={<ReceiveLineReadonlyValue value={variantText} />}
                uomDisplay={uomDisplay}
                qty={recvQty[ln.id] ?? ''}
                unitCost={recvUnitCost[ln.id] ?? ''}
                unitCostLabel={tInv('movement.receipt.unit_cost_per_uom', { uom: uomDisplay })}
                unitCostFooter={
                  <ReceiveUnitCostHint
                    productId={ln.product_id}
                    uomId={ln.uom_id}
                    unitCost={recvUnitCost[ln.id] ?? ''}
                  />
                }
                qtyMax={remaining}
                disabled={pending}
                onQtyChange={(v) => setRecvQty((prev) => ({ ...prev, [ln.id]: v }))}
                onUnitCostChange={(v) => setRecvUnitCost((prev) => ({ ...prev, [ln.id]: v }))}
              />
              <ReceiveLineProgressHint progress={progress} />
            </div>
          );
        }

        return (
          <PoReceiveVariantSplitRows
            key={ln.id}
            productId={ln.product_id}
            productLabel={label}
            uomDisplay={uomDisplay}
            uomId={ln.uom_id}
            ordered={ln.qty}
            alreadyReceived={already}
            remaining={remaining}
            rows={splitsByLine[ln.id] ?? []}
            disabled={pending}
            onChange={(rows) => setSplitsByLine((prev) => ({ ...prev, [ln.id]: rows }))}
          />
        );
      })}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-md border bg-card p-3">
          <Label className="text-xs font-medium text-muted-foreground">
            {t('orders.notes_section.order_title')}
          </Label>
          <p className="max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {po.notes?.trim() ? po.notes : t('orders.notes_section.empty')}
          </p>
        </div>
        <div className="space-y-1.5 rounded-md border bg-card p-3">
          <Label className="text-xs font-medium text-muted-foreground">
            {t('orders.notes_section.receipt_title')}
          </Label>
          <Textarea
            rows={2}
            disabled={pending}
            value={receiptNotes}
            onChange={(e) => setReceiptNotes(e.target.value)}
            placeholder={t('orders.notes_section.placeholder')}
            className="min-h-[3.5rem] resize-y text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={handleSubmit}>
          {t('orders.receive.submit')}
        </Button>
      </div>
    </div>
  );
}
