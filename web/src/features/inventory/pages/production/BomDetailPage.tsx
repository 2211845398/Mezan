import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { formatMoney } from '@/lib/format';

import type { BomLineRead } from '../../api/production';
import { calculateBomCost } from '../../api/production';
import { bomDetailQueryOptions } from '../../queries';

export default function BomDetailPage() {
  const { id = '0' } = useParams<{ id: string }>();
  const bomId = Number(id);
  const { t } = useTranslation('inventory');
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 1;
  const [previewQty, setPreviewQty] = useState('1');
  const { data, isLoading, isError } = useQuery(bomDetailQueryOptions(bomId));

  const costPreview = useMutation({
    mutationFn: () =>
      calculateBomCost({
        bom_id: bomId,
        branch_id: branchId,
        qty: previewQty || '1',
      }),
    onSuccess: () => toast.success(t('production.cost_calculated')),
    onError: (err) => notifyApiError(err),
  });

  const columns = useMemo(
    () =>
      defineColumns<BomLineRead>()([
        { id: 'product', accessorKey: 'component_product_name', header: t('production.col.component') },
        {
          id: 'qty',
          accessorKey: 'qty_required',
          header: t('production.col.qty'),
          cell: ({ row }) => <span className="num-latin">{String(row.original.qty_required)}</span>,
        },
        {
          id: 'snapshot',
          header: t('production.col.unit_cost'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin">
              {formatMoney(row.original.unit_cost_at_creation ?? 0)}
            </span>
          ),
        },
      ]),
    [t],
  );

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
        title={data.name}
        description={`${data.finished_product_name} · v${data.version}`}
        actions={
          <Button type="button" variant="outline" asChild>
            <Link to="/inventory/production">{t('production.back')}</Link>
          </Button>
        }
      />

      <SectionCard title={t('production.components_section')}>
        <DataTable mode="client" columns={columns} data={data.lines} showSearch={false} />
      </SectionCard>

      <SectionCard title={t('production.cost_preview')}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label>{t('production.col.qty')}</Label>
            <Input value={previewQty} onChange={(e) => setPreviewQty(e.target.value)} className="w-32" />
          </div>
          <Button type="button" variant="outline" onClick={() => costPreview.mutate()} disabled={costPreview.isPending}>
            {t('production.calculate_cost')}
          </Button>
        </div>
        {costPreview.data ? (
          <div className="mt-4 space-y-2 text-sm">
            <p>
              {t('production.total_raw_cost')}:{' '}
              <span className="font-medium tabular-nums num-latin">
                {formatMoney(costPreview.data.total_cost)}
              </span>
            </p>
            <p>
              {t('production.unit_cost')}:{' '}
              <span className="font-medium tabular-nums num-latin">
                {formatMoney(costPreview.data.unit_cost)}
              </span>
            </p>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
