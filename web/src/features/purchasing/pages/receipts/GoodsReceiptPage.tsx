import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/ContentSurface';
import { Button } from '@/components/ui/button';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { getProductWithVariants } from '@/features/catalog/api';
import { usePermission } from '@/hooks/usePermission';

import GoodsReceiptFields from '../../components/GoodsReceiptFields';
import { trackPurchaseOrder } from '../../api';
import { goodsReceiptsQueryOptions, purchaseOrderQueryOptions, purchasingKeys } from '../../queries';

export default function GoodsReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const poId = id ? Number(id) : NaN;
  const { t } = useTranslation('purchasing');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canUpdate = usePermission('purchase_orders', 'update');

  const { data: po, isLoading } = useQuery({
    ...purchaseOrderQueryOptions(poId),
    enabled: !Number.isNaN(poId),
  });
  const { data: receipts = [] } = useQuery({
    ...goodsReceiptsQueryOptions(poId),
    enabled: !Number.isNaN(poId),
  });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const productIds = useMemo(
    () => [...new Set((po?.lines ?? []).map((l) => l.product_id))],
    [po?.lines],
  );

  const { data: productLabels = {} } = useQuery({
    queryKey: ['purchasing', 'receive-labels', poId, productIds.join(',')],
    queryFn: async () => {
      const labels: Record<number, string> = {};
      for (const pid of productIds) {
        const pw = await getProductWithVariants(pid);
        labels[pid] = pw.product.name;
      }
      return labels;
    },
    enabled: !Number.isNaN(poId) && productIds.length > 0,
  });

  if (Number.isNaN(poId)) {
    return null;
  }
  if (isLoading || !po) {
    return <div className="p-4 text-sm text-muted-foreground">…</div>;
  }

  const canReceive =
    canUpdate && (po.status === 'sent' || po.status === 'tracked');

  return (
    <div className="flex flex-col gap-6 p-4">
      <PageHeader
        title={t('orders.receive.page_title', { id: po.id })}
        subtitle={po.supplier_name}
        actions={<BackButton to={`/purchasing/orders/${po.id}`} label={tc('actions.back')} />}
      />

      {!canReceive ? (
        <p className="text-sm text-muted-foreground">{t('orders.receive.not_available')}</p>
      ) : (
        <SectionCard title={t('orders.receive.title')}>
          <GoodsReceiptFields
            purchaseOrder={po}
            receipts={receipts}
            branches={branches}
            productLabels={productLabels}
            onPosted={async () => {
              if (po.status === 'sent') {
                try {
                  await trackPurchaseOrder(poId);
                } catch {
                  /* optional auto-track */
                }
              }
              await qc.invalidateQueries({ queryKey: purchasingKeys.root });
              const updated = await qc.fetchQuery(purchaseOrderQueryOptions(poId));
              if (updated?.status === 'closed') {
                toast.success(t('orders.detail_page.closed_ok'));
              }
              navigate(`/purchasing/orders/${poId}`);
            }}
          />
        </SectionCard>
      )}

      <Button type="button" variant="outline" asChild>
        <Link to={`/purchasing/orders/${po.id}`}>{t('orders.detail')}</Link>
      </Button>
    </div>
  );
}
