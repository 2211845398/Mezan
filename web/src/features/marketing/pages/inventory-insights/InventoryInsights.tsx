import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/ContentSurface';
import type { PromotionPerformanceItem } from '@/features/marketing/api';
import {
  inventoryAlertsQueryOptions,
  promotionPerformanceQueryOptions,
  slowMovingQueryOptions,
} from '@/features/marketing/queries';
import { Button } from '@/components/ui/button';
import type { components } from '@/api/generated/schema';

type SlowRow = components['schemas']['SlowMovingProductItem'];
type AlertRow = components['schemas']['InventoryAlertItem'];

export default function InventoryInsights() {
  const { t } = useTranslation('marketing');
  const slow = useQuery(slowMovingQueryOptions({ threshold_qty: 5, limit: 100 }));
  const alerts = useQuery(inventoryAlertsQueryOptions(30));
  const promos = useQuery(promotionPerformanceQueryOptions(100));

  const slowCols = useMemo(
    () =>
      defineColumns<SlowRow>()([
        { id: 'p', accessorKey: 'product_name', header: t('inventoryInsights.col_product') },
        {
          id: 'q',
          accessorKey: 'total_qty_sold',
          header: t('inventoryInsights.col_qty_sold'),
          cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
        },
        {
          id: 'd',
          accessorKey: 'last_sold_at',
          header: t('inventoryInsights.col_last_sold'),
          cell: ({ getValue }) => (
            <span className="num-latin text-muted-foreground">
              {getValue() ? String(getValue()).slice(0, 10) : '—'}
            </span>
          ),
        },
      ]),
    [t],
  );

  const alertCols = useMemo(
    () =>
      defineColumns<AlertRow>()([
        { id: 'p', accessorKey: 'product_name', header: t('inventoryInsights.col_product') },
        {
          id: 'b',
          accessorKey: 'branch_id',
          header: t('inventoryInsights.col_branch'),
          cell: ({ getValue }) => <span className="tabular-nums">#{String(getValue())}</span>,
        },
        {
          id: 'oh',
          accessorKey: 'on_hand',
          header: t('inventoryInsights.col_on_hand'),
          cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
        },
        {
          id: 'exp',
          accessorKey: 'days_until_expiry',
          header: t('inventoryInsights.col_days_expiry'),
          cell: ({ getValue }) => (
            <span className="tabular-nums">{getValue() != null ? String(getValue()) : '—'}</span>
          ),
        },
      ]),
    [t],
  );

  const promoCols = useMemo(
    () =>
      defineColumns<PromotionPerformanceItem>()([
        { id: 'c', accessorKey: 'code', header: t('inventoryInsights.col_code') },
        { id: 'n', accessorKey: 'name', header: t('inventoryInsights.col_promo_name') },
        {
          id: 'u',
          accessorKey: 'usage_count',
          header: t('inventoryInsights.col_usage'),
          cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
        },
        {
          id: 'd',
          accessorKey: 'total_discount_given',
          header: t('inventoryInsights.col_discount'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums">
              {String(getValue())}
            </span>
          ),
        },
      ]),
    [t],
  );

  const hasError = slow.isError || alerts.isError || promos.isError;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <PageHeader title={t('inventoryInsights.title')} subtitle={t('inventoryInsights.subtitle')} />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/marketing/analytics">{t('inventoryInsights.back_analytics')}</Link>
        </Button>
      </div>

      {hasError ? <p className="text-sm text-destructive">{t('analytics.load_error')}</p> : null}

      <SectionCard title={t('inventoryInsights.slow_title')} description={t('inventoryInsights.slow_hint')}>
        <DataTable
          mode="client"
          columns={slowCols}
          data={slow.data?.items ?? []}
          isLoading={slow.isLoading}
          isError={slow.isError}
          onRetry={() => void slow.refetch()}
          showPagination={slow.data != null && slow.data.items.length > 25}
          showSearch={false}
          emptyState={<p className="text-sm text-muted-foreground">{t('inventoryInsights.empty')}</p>}
        />
      </SectionCard>

      <SectionCard title={t('inventoryInsights.alerts_title')} description={t('inventoryInsights.alerts_hint')}>
        <DataTable
          mode="client"
          columns={alertCols}
          data={alerts.data?.items ?? []}
          isLoading={alerts.isLoading}
          isError={alerts.isError}
          onRetry={() => void alerts.refetch()}
          showPagination={alerts.data != null && alerts.data.items.length > 25}
          showSearch={false}
          emptyState={<p className="text-sm text-muted-foreground">{t('inventoryInsights.empty')}</p>}
        />
      </SectionCard>

      <SectionCard title={t('inventoryInsights.promo_title')} description={t('inventoryInsights.promo_hint')}>
        <DataTable
          mode="client"
          columns={promoCols}
          data={promos.data?.items ?? []}
          isLoading={promos.isLoading}
          isError={promos.isError}
          onRetry={() => void promos.refetch()}
          showPagination={promos.data != null && promos.data.items.length > 25}
          showSearch={false}
          emptyState={<p className="text-sm text-muted-foreground">{t('inventoryInsights.empty')}</p>}
        />
      </SectionCard>
    </div>
  );
}
