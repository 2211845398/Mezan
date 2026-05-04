import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

import { type GoodsReceiptRead, type PurchaseOrderRead,receiveGoodsForPurchaseOrder } from '../../api';
import { purchasingKeys } from '../../queries';

export function aggregateReceivedQtyByPoLine(receipts: GoodsReceiptRead[]): Record<number, number> {
  const m: Record<number, number> = {};
  for (const r of receipts) {
    for (const ln of r.lines ?? []) {
      const polId = ln.purchase_order_line_id;
      if (polId == null) continue;
      m[polId] = (m[polId] ?? 0) + ln.qty;
    }
  }
  return m;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrderRead;
  receipts: GoodsReceiptRead[];
  branches: BranchRead[];
  /** Called after a successful post (inventory + GL). Parent may chain track PO, etc. */
  onPosted?: () => void | Promise<void>;
};

export default function GoodsReceiptForm({
  open,
  onOpenChange,
  purchaseOrder: po,
  receipts,
  branches,
  onPosted,
}: Props) {
  const { t } = useTranslation('purchasing');
  const { t: tCommon } = useTranslation('common');
  const qc = useQueryClient();
  const receivedByLine = useMemo(() => aggregateReceivedQtyByPoLine(receipts), [receipts]);

  const [recvBranch, setRecvBranch] = useState('');
  const [recvQty, setRecvQty] = useState<Record<number, string>>({});
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      idempotencyKeyRef.current = null;
      setRecvQty({});
      return;
    }
    idempotencyKeyRef.current = newIdempotencyKey();
    if (po.branch_id != null) {
      setRecvBranch(String(po.branch_id));
    }
    const init: Record<number, string> = {};
    for (const ln of po.lines ?? []) {
      const rem = ln.qty - (receivedByLine[ln.id] ?? 0);
      init[ln.id] = rem > 0 ? String(rem) : '';
    }
    setRecvQty(init);
  }, [open, po.branch_id, po.lines, receivedByLine]);

  const receiveM = useMutation({
    mutationFn: async () => {
      const branch_id = Number(recvBranch);
      const lines = (po.lines ?? [])
        .map((ln) => ({
          purchase_order_line_id: ln.id,
          qty: Number(recvQty[ln.id] ?? 0),
        }))
        .filter((l) => l.qty > 0);
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
      onOpenChange(false);
      await onPosted?.();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('orders.receive.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>{t('orders.receive.branch')}</Label>
            <Select value={recvBranch || '__'} onValueChange={(v) => setRecvBranch(v === '__' ? '' : v)}>
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
          <p className="text-xs text-muted-foreground">{t('orders.receive.idempotency_note')}</p>
          {(po.lines ?? []).map((ln) => {
            const already = receivedByLine[ln.id] ?? 0;
            const remaining = Math.max(0, ln.qty - already);
            return (
              <div key={ln.id} className="grid gap-1">
                <Label>
                  {t('orders.receive.qty')} (line {ln.id} · product {ln.product_id}) —{' '}
                  {t('orders.detail_page.remaining')}: {remaining}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={remaining}
                  value={recvQty[ln.id] ?? ''}
                  onChange={(e) =>
                    setRecvQty((prev) => ({ ...prev, [ln.id]: e.target.value }))
                  }
                />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="button" disabled={receiveM.isPending} onClick={() => void receiveM.mutate()}>
            {t('orders.receive.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
