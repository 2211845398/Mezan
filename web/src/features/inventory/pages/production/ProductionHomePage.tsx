import { useQuery } from '@tanstack/react-query';
import { Factory, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatMoney } from '@/lib/format';

import type { BomRead, ProductionOrderRead } from '../../api/production';
import { bomsQueryOptions, productionOrdersQueryOptions } from '../../queries';

export default function ProductionHomePage() {
  const { t } = useTranslation('inventory');
  const canCreate = usePermission('production_orders', 'create');
  const boms = useQuery(bomsQueryOptions());
  const orders = useQuery(productionOrdersQueryOptions());

  const bomColumns = useMemo(
    () =>
      defineColumns<BomRead>()([
        {
          id: 'name',
          accessorKey: 'name',
          header: t('production.col.bom_name'),
          cell: ({ row }) => (
            <Link
              className="font-medium text-primary hover:underline"
              to={`/inventory/production/boms/${row.original.id}`}
            >
              {row.original.name}
            </Link>
          ),
        },
        {
          id: 'product',
          header: t('production.col.finished_product'),
          cell: ({ row }) => row.original.finished_product_name || `#${row.original.finished_product_id}`,
        },
        { id: 'version', accessorKey: 'version', header: t('production.col.version') },
        {
          id: 'active',
          accessorKey: 'is_active',
          header: t('production.col.active'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.is_active ? 'active' : 'inactive'}
              label={row.original.is_active ? t('production.active_yes') : t('production.active_no')}
            />
          ),
        },
      ]),
    [t],
  );

  const orderColumns = useMemo(
    () =>
      defineColumns<ProductionOrderRead>()([
        {
          id: 'order_number',
          accessorKey: 'order_number',
          header: t('production.col.order_number'),
          cell: ({ row }) => (
            <Link
              className="font-medium text-primary hover:underline num-latin"
              to={`/inventory/production/orders/${row.original.id}`}
            >
              {row.original.order_number}
            </Link>
          ),
        },
        { id: 'bom', accessorKey: 'bom_name', header: t('production.col.bom_name') },
        { id: 'branch', accessorKey: 'branch_name', header: t('production.col.branch') },
        {
          id: 'qty',
          header: t('production.col.qty'),
          cell: ({ row }) => (
            <span className="num-latin">
              {String(row.original.qty_produced || row.original.qty_to_produce)}
            </span>
          ),
        },
        {
          id: 'status',
          accessorKey: 'status',
          header: t('production.col.status'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.status}
              label={t(`production.status.${row.original.status}`, row.original.status)}
            />
          ),
        },
        {
          id: 'cost',
          header: t('production.col.total_cost'),
          cell: ({ row }) => (
            <span className="tabular-nums num-latin">{formatMoney(row.original.finished_goods_value)}</span>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-8 p-6">
      <PageHeader
        title={t('production.title')}
        description={t('production.subtitle')}
        actions={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" asChild>
                <Link to="/inventory/production/boms/new">
                  <Plus className="size-4" />
                  {t('production.new_bom')}
                </Link>
              </Button>
              <Button type="button" asChild>
                <Link to="/inventory/production/orders/new">
                  <Factory className="size-4" />
                  {t('production.new_order')}
                </Link>
              </Button>
            </div>
          ) : null
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('production.boms_section')}</h2>
        <DataTable
          mode="client"
          columns={bomColumns}
          data={boms.data ?? []}
          isLoading={boms.isLoading}
          isError={boms.isError}
          onRetry={() => void boms.refetch()}
          searchPlaceholder={t('production.search_bom')}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('production.orders_section')}</h2>
        <DataTable
          mode="client"
          columns={orderColumns}
          data={orders.data ?? []}
          isLoading={orders.isLoading}
          isError={orders.isError}
          onRetry={() => void orders.refetch()}
          searchPlaceholder={t('production.search_order')}
        />
      </section>
    </div>
  );
}
