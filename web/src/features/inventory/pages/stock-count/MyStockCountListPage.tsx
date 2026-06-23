import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';

import { listMyStockCountSessions, type StockCountSessionRead } from '../api';

export default function MyStockCountListPage() {
  const { t } = useTranslation('inventory');

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-stock-count-sessions'],
    queryFn: () => listMyStockCountSessions({ limit: 100 }),
  });

  const columns = useMemo(
    () =>
      defineColumns<StockCountSessionRead>()([
        {
          id: 'version',
          header: t('movement.stock_count.col_version'),
          cell: ({ row }) => row.original.version_no,
        },
        {
          id: 'branch',
          header: t('movement.stock_count.col_branch'),
          cell: ({ row }) => row.original.branch_name,
        },
        {
          id: 'status',
          header: t('movement.stock_count.col_status'),
          cell: ({ row }) => t(`movement.stock_count.status_${row.original.status}`, row.original.status),
        },
        {
          id: 'lines',
          header: t('movement.stock_count.col_lines'),
          cell: ({ row }) => row.original.line_count,
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to={`/my-stock-count/${row.original.id}`}>{t('movement.stock_count.fill')}</Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('movement.stock_count.my_list_title')} />
      <DataTable
        mode="client"
        showSearch={false}
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={
          <p className="text-muted-foreground text-sm">{t('movement.stock_count.my_empty')}</p>
        }
        getRowId={(r) => String(r.id)}
      />
    </div>
  );
}
