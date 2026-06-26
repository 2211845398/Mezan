import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { formatMoney } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/idempotency';

import { completeProductionOrder, issueProductionOrder } from '../../api/production';
import { inventoryKeys, productionOrderDetailQueryOptions } from '../../queries';

export default function ProductionOrderDetailPage() {
  const { id = '0' } = useParams<{ id: string }>();
  const orderId = Number(id);
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const canUpdate = usePermission('production_orders', 'update');
  const { data, isLoading, isError, refetch } = useQuery(productionOrderDetailQueryOptions(orderId));
  const [overhead, setOverhead] = useState('');

  const issueMut = useMutation({
    mutationFn: () => issueProductionOrder(orderId, newIdempotencyKey()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.productionOrder(orderId) });
      await refetch();
      toast.success(t('production.materials_issued'));
    },
    onError: (err) => notifyApiError(err),
  });

  const completeMut = useMutation({
    mutationFn: () =>
      completeProductionOrder(orderId, { overhead_cost: overhead || '0' }, newIdempotencyKey()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.productionOrders({}) });
      await refetch();
      toast.success(t('production.order_completed'));
    },
    onError: (err) => notifyApiError(err),
  });

  const finalPreview = useMemo(() => {
    if (!data) return '0';
    const raw = Number(data.total_cost_issued ?? 0);
    const oh = Number(overhead || 0);
    return String(raw + oh);
  }, [data, overhead]);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('production.loading')}</div>;
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Button type="button" variant="outline" asChild>
          <Link to="/inventory/production">{t('production.back')}</Link>
        </Button>
        <p className="text-destructive">{t('production.load_error')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={data.order_number}
        description={`${data.bom_name} · ${data.branch_name}`}
        actions={
          <Button type="button" variant="outline" asChild>
            <Link to="/inventory/production">{t('production.back')}</Link>
          </Button>
        }
      />

      <SectionCard title={t('production.order_summary')}>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('production.col.status')}</p>
            <StatusBadge
              status={data.status}
              label={t(`production.status.${data.status}`, data.status)}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('production.col.qty')}</p>
            <p className="num-latin">{String(data.qty_to_produce)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('production.total_raw_cost')}</p>
            <p className="tabular-nums num-latin">{formatMoney(data.total_cost_issued)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('production.final_cost')}</p>
            <p className="tabular-nums num-latin">{formatMoney(data.finished_goods_value)}</p>
          </div>
        </div>
      </SectionCard>

      {canUpdate && data.status === 'draft' ? (
        <SectionCard title={t('production.issue_materials')}>
          <p className="mb-3 text-sm text-muted-foreground">{t('production.issue_hint')}</p>
          <Button type="button" onClick={() => issueMut.mutate()} disabled={issueMut.isPending}>
            {t('production.issue_materials')}
          </Button>
        </SectionCard>
      ) : null}

      {canUpdate && data.status === 'in_progress' ? (
        <SectionCard title={t('production.complete_order')}>
          <div className="grid max-w-md gap-4">
            <div>
              <Label>{t('production.total_raw_cost')}</Label>
              <p className="text-lg font-medium tabular-nums num-latin">
                {formatMoney(data.total_cost_issued)}
              </p>
            </div>
            <div className="grid gap-1">
              <Label>{t('production.overhead_cost')}</Label>
              <MoneyInput value={overhead} onChange={setOverhead} />
            </div>
            <div>
              <Label>{t('production.final_cost')}</Label>
              <p className="text-lg font-semibold tabular-nums num-latin">{formatMoney(finalPreview)}</p>
            </div>
            <Button type="button" onClick={() => completeMut.mutate()} disabled={completeMut.isPending}>
              {t('production.complete_order')}
            </Button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
