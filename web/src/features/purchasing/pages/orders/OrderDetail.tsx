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
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { getProductWithVariants } from '@/features/catalog/api';
import PoReceiptsSection from '@/features/purchasing/components/PoReceiptsSection';
import { poGoldOutlineButtonClass } from '@/features/purchasing/lib/poButtonStyles';
import { aggregateReceivedUnitCostByPoLine } from '@/features/purchasing/lib/aggregateReceivedUnitCostByPoLine';
import { formatMoney } from '@/lib/format';
import { usePermission } from '@/hooks/usePermission';
import { newIdempotencyKey } from '@/lib/idempotency';
import { cn } from '@/lib/utils';

import {
  cancelPurchaseOrder,
  closePurchaseOrder,
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
  const { t: tc, i18n } = useTranslation('common');
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
  const unitCostByLine = useMemo(() => aggregateReceivedUnitCostByPoLine(receipts), [receipts]);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const branchesById = useMemo(
    () => Object.fromEntries(branches.map((b) => [b.id, b.name])),
    [branches],
  );

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

  const showReceive =
    canUpdate && (po.status === 'sent' || po.status === 'tracked') && !allFullyReceived;

  /** Only before «قيد التنفيذ» — redundant once status is already tracked. */
  const showTrack = canUpdate && po.status === 'sent' && !allFullyReceived;

  const showCloseEarly =
    canUpdate &&
    (po.status === 'sent' || po.status === 'tracked') &&
    !allFullyReceived;

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
          <div
            className={cn(
              'flex flex-wrap gap-2',
              i18n.dir() === 'ltr' && 'flex-row-reverse',
            )}
          >
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
            {canUpdate && po.status === 'draft' ? (
              <Button type="button" variant="outline" asChild>
                <Link to={`/purchasing/orders/${po.id}/edit`}>{t('orders.edit')}</Link>
              </Button>
            ) : null}
            {showTrack ? (
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
            {showReceive ? (
              <Button type="button" asChild>
                <Link to={`/purchasing/orders/${po.id}/receive`}>{t('orders.detail_page.receive')}</Link>
              </Button>
            ) : null}
            {showCloseEarly ? (
              <Button type="button" variant="outline" onClick={() => void closeM.mutate()} disabled={closeM.isPending}>
                {t('orders.detail_page.close')}
              </Button>
            ) : null}
            <BackButton to="/purchasing/orders" label={tc('actions.back')} />
          </div>
        }
      />

      <StatusStepper steps={stepperSteps} current={poStepperCurrent(po.status)} />

      <SectionCard title={t('orders.notes_section.order_title')}>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {po.notes?.trim() ? po.notes : t('orders.notes_section.empty')}
        </p>
      </SectionCard>

      <SectionCard title={t('orders.detail_page.lines')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('orders.detail_page.line_no')}</TableHead>
              <TableHead>{t('orders.form.product')}</TableHead>
              <TableHead>{t('orders.detail_page.unit_cost_col')}</TableHead>
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
                  <TableCell className="tabular-nums num-latin">
                    {unitCostByLine[ln.id] != null
                      ? formatMoney(unitCostByLine[ln.id]!)
                      : t('orders.detail_page.unit_cost_at_receive')}
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
        <PoReceiptsSection
          receipts={receipts}
          productLabels={productLabels}
          variantLabels={variantLabels}
          branchesById={branchesById}
        />
      </SectionCard>
    </div>
  );
}
