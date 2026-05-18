import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { StatusStepper } from '@/components/shared/StatusStepper';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getProductWithVariants } from '@/features/catalog/api';
import { poGoldOutlineButtonClass } from '@/features/purchasing/lib/poButtonStyles';
import { usePermission } from '@/hooks/usePermission';
import { newIdempotencyKey } from '@/lib/idempotency';
import { cn } from '@/lib/utils';

import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  type GoodsReceiptRead,
  sendPurchaseOrder,
  trackPurchaseOrder,
} from '../../api';
import { aggregateReceivedQtyByPoLine } from '../../lib/aggregateReceivedQtyByPoLine';
import { goodsReceiptsQueryOptions, purchaseOrderQueryOptions, purchasingKeys } from '../../queries';

const PO_STEPS = ['draft', 'sent', 'tracked', 'closed'] as const;

function poStepperCurrent(status: string): (typeof PO_STEPS)[number] {
  if (status === 'cancelled') return 'draft';
  if (PO_STEPS.includes(status as (typeof PO_STEPS)[number])) {
    return status as (typeof PO_STEPS)[number];
  }
  return 'draft';
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const poId = id ? Number(id) : NaN;
  const { t } = useTranslation('purchasing');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const canUpdate = usePermission('purchase_orders', 'update');

  const { data: po, refetch, isLoading } = useQuery({
    ...purchaseOrderQueryOptions(poId),
    enabled: !Number.isNaN(poId),
  });
  const { data: receipts = [] } = useQuery({
    ...goodsReceiptsQueryOptions(poId),
    enabled: !Number.isNaN(poId),
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
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const cancelM = useMutation({
    mutationFn: () => cancelPurchaseOrder(poId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const trackM = useMutation({
    mutationFn: () => trackPurchaseOrder(poId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const closeM = useMutation({
    mutationFn: () => closePurchaseOrder(poId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('orders.detail_page.closed_ok'));
      void refetch();
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const receivedByLine = useMemo(() => aggregateReceivedQtyByPoLine(receipts), [receipts]);

  const productIds = useMemo(
    () => [...new Set((po?.lines ?? []).map((l) => l.product_id))],
    [po?.lines],
  );

  const { data: lineMeta } = useQuery({
    queryKey: ['purchasing', 'po-line-meta', poId, productIds.join(',')],
    queryFn: async () => {
      const productLabels: Record<number, string> = {};
      const variantLabels: Record<number, string> = {};
      for (const pid of productIds) {
        const pw = await getProductWithVariants(pid);
        productLabels[pid] = pw.product.name;
        for (const v of pw.variants) {
          variantLabels[v.id] = v.sku;
        }
      }
      return { productLabels, variantLabels };
    },
    enabled: !Number.isNaN(poId) && productIds.length > 0,
  });

  const productLabels = lineMeta?.productLabels ?? {};
  const variantLabels = lineMeta?.variantLabels ?? {};

  if (Number.isNaN(poId)) {
    return null;
  }
  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">…</div>;
  }
  if (!po) {
    return null;
  }

  const allFullyReceived = (po.lines ?? []).every((ln) => {
    const got = receivedByLine[ln.id] ?? 0;
    return Math.max(0, ln.qty - got) === 0;
  });

  const showReceiveActions =
    canUpdate &&
    (po.status === 'sent' || po.status === 'tracked') &&
    !allFullyReceived &&
    po.status !== 'closed' &&
    po.status !== 'cancelled';

  const stepperSteps = PO_STEPS.map((key) => ({
    key,
    label: t(`orders.status.${key}`),
  }));

  return (
    <div className="flex flex-col gap-6 p-4">
      <PageHeader
        title={`PO-${po.id}`}
        subtitle={po.supplier_name}
        actions={
          <div className="flex flex-wrap gap-2">
            <BackButton to="/purchasing/orders" label={tc('actions.back')} />
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
            {showReceiveActions ? (
              <Button
                type="button"
                variant="outline"
                className={cn(poGoldOutlineButtonClass)}
                onClick={() => void trackM.mutate()}
                disabled={trackM.isPending}
              >
                {t('orders.detail_page.track')}
              </Button>
            ) : null}
            {showReceiveActions ? (
              <Button type="button" asChild>
                <Link to={`/purchasing/orders/${po.id}/receive`}>{t('orders.detail_page.receive')}</Link>
              </Button>
            ) : null}
            {canUpdate && (po.status === 'sent' || po.status === 'tracked') && !allFullyReceived ? (
              <Button type="button" variant="outline" onClick={() => void closeM.mutate()} disabled={closeM.isPending}>
                {t('orders.detail_page.close')}
              </Button>
            ) : null}
          </div>
        }
      />

      <StatusStepper steps={stepperSteps} current={poStepperCurrent(po.status)} />

      <SectionCard title={t('orders.detail_page.lines')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t('orders.form.product')}</TableHead>
              <TableHead>{t('orders.detail_page.variant_col')}</TableHead>
              <TableHead>{t('orders.form.qty')}</TableHead>
              <TableHead>{t('orders.detail_page.received_col')}</TableHead>
              <TableHead>{t('orders.detail_page.remaining')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(po.lines ?? []).map((ln) => {
              const got = receivedByLine[ln.id] ?? 0;
              const rem = Math.max(0, ln.qty - got);
              return (
                <TableRow key={ln.id}>
                  <TableCell>{ln.id}</TableCell>
                  <TableCell>{productLabels[ln.product_id] ?? `#${ln.product_id}`}</TableCell>
                  <TableCell>
                    {ln.variant_id != null && ln.variant_id > 0
                      ? variantLabels[ln.variant_id] ?? `#${ln.variant_id}`
                      : t('orders.detail_page.variant_at_receive')}
                  </TableCell>
                  <TableCell>{ln.qty}</TableCell>
                  <TableCell>{got}</TableCell>
                  <TableCell>{rem}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title={t('orders.detail_page.receipts')}>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          receipts.map((r: GoodsReceiptRead) => (
            <div key={r.id} className="mb-4 rounded-md border p-3 text-sm last:mb-0">
              <div>
                #{r.id} · {r.created_at?.slice(0, 19)}
              </div>
              <ul className="ms-4 list-disc">
                {(r.lines ?? []).map((ln) => (
                  <li key={ln.id}>
                    {productLabels[ln.product_id] ?? ln.product_id}
                    {ln.variant_id != null ? ` · ${variantLabels[ln.variant_id] ?? ln.variant_id}` : ''} ×{' '}
                    {ln.qty} @ {ln.unit_cost}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </SectionCard>
    </div>
  );
}
