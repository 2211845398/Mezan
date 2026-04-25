import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import type { StockMovement } from '../../api';
import { useMovementsQuery } from '../../queries';

export default function AdjustmentsList() {
  const { t } = useTranslation('inventory');
  const canCreate = usePermission('stock_adjustments', 'create');
  const { data: rows = [], isLoading, isError, refetch } = useMovementsQuery({ limit: 200, offset: 0 });

  const columns = defineColumns<StockMovement>()([
    { id: 'id', accessorKey: 'id', header: 'ID' },
    { id: 'branch', accessorKey: 'branch_id', header: t('adjustments.col.branch') },
    { id: 'product', accessorKey: 'product_id', header: t('adjustments.col.product') },
    { id: 'delta', accessorKey: 'qty_delta', header: t('adjustments.col.delta') },
    { id: 'reason', accessorKey: 'reason', header: t('adjustments.col.reason') },
    {
      id: 'at',
      accessorKey: 'created_at',
      header: t('adjustments.col.at'),
      cell: ({ row }) =>
        row.original.created_at ? formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm') : '—',
    },
  ]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('adjustments.title')}</h1>
        {canCreate ? (
          <Button type="button" asChild>
            <Link to="/inventory/adjustments/new">{t('adjustments.new')}</Link>
          </Button>
        ) : null}
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
