import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { newIdempotencyKey } from '@/lib/idempotency';

import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  type GoodsReceiptRead,
  receiveGoodsForPurchaseOrder,
  sendPurchaseOrder,
  trackPurchaseOrder,
} from '../../api';
import { goodsReceiptsQueryOptions, purchaseOrderQueryOptions, purchasingKeys } from '../../queries';

function lineTotal(unit: string, qty: number): string {
  return new Decimal(unit || 0).mul(qty).toFixed(2);
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const poId = id ? Number(id) : NaN;
  const { t } = useTranslation('purchasing');
  const qc = useQueryClient();
  const canUpdate = usePermission('purchase_orders', 'update');

  const { data: po, refetch, isLoading } = useQuery({
    ...purchaseOrderQueryOptions(poId),
    enabled: !Number.isNaN(poId),
  });
  const { data: receipts = [], refetch: refetchReceipts } = useQuery({
    ...goodsReceiptsQueryOptions(poId),
    enabled: !Number.isNaN(poId),
  });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const sendM = useMutation({
    mutationFn: async () => {
      const idem = newIdempotencyKey();
      return sendPurchaseOrder(poId, { idempotency_key: idem }, idem);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('orders.form.sent_toast'));
      void refetch();
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const cancelM = useMutation({
    mutationFn: () => cancelPurchaseOrder(poId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      void refetch();
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const trackM = useMutation({
    mutationFn: () => trackPurchaseOrder(poId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      void refetch();
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const closeM = useMutation({
    mutationFn: () => closePurchaseOrder(poId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('orders.detail_page.closed_ok'));
      void refetch();
    },
    onError: () => toast.error(t('errors.generic')),
  });

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [recvBranch, setRecvBranch] = useState<string>('');
  const [recvQty, setRecvQty] = useState<Record<number, string>>({});

  useEffect(() => {
    if (receiveOpen && po?.branch_id) {
      setRecvBranch(String(po.branch_id));
    }
  }, [receiveOpen, po?.branch_id]);

  const receiveM = useMutation({
    mutationFn: async () => {
      const branch_id = Number(recvBranch);
      const lines = (po?.lines ?? [])
        .map((ln) => ({
          purchase_order_line_id: ln.id,
          qty: Number(recvQty[ln.id] ?? 0),
        }))
        .filter((l) => l.qty > 0);
      if (!branch_id || lines.length === 0) {
        throw new Error('branch and qty');
      }
      return receiveGoodsForPurchaseOrder(poId, {
        branch_id,
        lines,
        idempotency_key: newIdempotencyKey(),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('orders.detail_page.receipt_ok'));
      setReceiveOpen(false);
      void refetch();
      void refetchReceipts();
    },
    onError: () => toast.error(t('errors.generic')),
  });

  if (Number.isNaN(poId)) {
    return null;
  }
  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">…</div>;
  }
  if (!po) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            {t('orders.col.po_number')}: PO-{po.id}
          </h1>
          <p className="text-sm text-muted-foreground">
            {po.supplier_name} ·{' '}
            {t(
              `orders.status.${
                ['draft', 'sent', 'tracked', 'closed', 'cancelled'].includes(po.status)
                  ? po.status
                  : 'draft'
              }`,
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to="/purchasing/orders">{t('orders.title')}</Link>
          </Button>
          {canUpdate && po.status === 'draft' ? (
            <Button type="button" variant="outline" asChild>
              <Link to={`/purchasing/orders/${po.id}/edit`}>{t('orders.edit')}</Link>
            </Button>
          ) : null}
          {canUpdate && po.status === 'draft' ? (
            <Button type="button" onClick={() => void sendM.mutate()} disabled={sendM.isPending}>
              {t('orders.detail_page.send')}
            </Button>
          ) : null}
          {canUpdate && po.status === 'draft' ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void cancelM.mutate()}
              disabled={cancelM.isPending}
            >
              {t('orders.detail_page.cancel')}
            </Button>
          ) : null}
          {canUpdate && (po.status === 'sent' || po.status === 'tracked') ? (
            <Button type="button" variant="secondary" onClick={() => void trackM.mutate()} disabled={trackM.isPending}>
              {t('orders.detail_page.track')}
            </Button>
          ) : null}
          {canUpdate && (po.status === 'sent' || po.status === 'tracked') ? (
            <Button type="button" onClick={() => setReceiveOpen(true)}>
              {t('orders.detail_page.receive')}
            </Button>
          ) : null}
          {canUpdate && (po.status === 'sent' || po.status === 'tracked') ? (
            <Button type="button" variant="outline" onClick={() => void closeM.mutate()} disabled={closeM.isPending}>
              {t('orders.detail_page.close')}
            </Button>
          ) : null}
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-medium">{t('orders.detail_page.timeline')}</h2>
        <ul className="list-inside list-disc text-sm text-muted-foreground">
          <li>
            {t('orders.status.draft')}: {po.created_at?.slice(0, 19) ?? '—'}
          </li>
          {po.sent_at ? (
            <li>
              {t('orders.status.sent')}: {po.sent_at.slice(0, 19)}
            </li>
          ) : null}
          <li>
            {t('orders.status.tracked')}: {po.status === 'tracked' || po.status === 'closed' ? '✓' : '—'}
          </li>
          <li>
            {t('orders.status.closed')}: {po.status === 'closed' ? '✓' : '—'}
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-medium">{t('orders.detail_page.lines')}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t('orders.form.product')}</TableHead>
              <TableHead>{t('orders.form.qty')}</TableHead>
              <TableHead>{t('orders.form.unit_cost')}</TableHead>
              <TableHead>{t('orders.form.line_total')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(po.lines ?? []).map((ln) => (
              <TableRow key={ln.id}>
                <TableCell>{ln.id}</TableCell>
                <TableCell>{ln.product_id}</TableCell>
                <TableCell>{ln.qty}</TableCell>
                <TableCell>{ln.unit_cost}</TableCell>
                <TableCell>{lineTotal(String(ln.unit_cost), ln.qty)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h2 className="mb-2 font-medium">{t('orders.detail_page.receipts')}</h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          receipts.map((r: GoodsReceiptRead) => (
            <div key={r.id} className="mb-4 rounded-md border p-3 text-sm">
              <div>
                #{r.id} · {r.created_at?.slice(0, 19)}
              </div>
              <ul className="ms-4 list-disc">
                {(r.lines ?? []).map((ln) => (
                  <li key={ln.id}>
                    product {ln.product_id} × {ln.qty} @ {ln.unit_cost}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
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
            {(po.lines ?? []).map((ln) => (
              <div key={ln.id} className="grid gap-1">
                <Label>
                  {t('orders.receive.qty')} (line {ln.id} · product {ln.product_id})
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={ln.qty}
                  value={recvQty[ln.id] ?? ''}
                  onChange={(e) =>
                    setRecvQty((prev) => ({ ...prev, [ln.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={receiveM.isPending} onClick={() => void receiveM.mutate()}>
              {t('orders.receive.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
