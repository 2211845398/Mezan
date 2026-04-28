import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import type { PriceListSummary } from '../../api';
import { usePriceListsQuery } from '../../queries';

export default function PriceListsList() {
  const { t } = useTranslation('catalog');
  const canUpdate = usePermission('catalog', 'update');
  const { data: rows = [], isLoading, isError, refetch } = usePriceListsQuery({ limit: 200, offset: 0 });

  const columns = defineColumns<PriceListSummary>()([
    { id: 'name', accessorKey: 'name', header: t('priceLists.col.name') },
    {
      id: 'from',
      accessorKey: 'effective_from',
      header: t('priceLists.col.from'),
      cell: ({ row }) => String(row.original.effective_from),
    },
    {
      id: 'to',
      header: t('priceLists.col.to'),
      cell: ({ row }) => row.original.effective_to ?? '—',
    },
    {
      id: 'branches',
      header: t('priceLists.col.branches'),
      cell: ({ row }) => row.original.branch_count,
    },
    {
      id: 'lines',
      header: t('priceLists.col.lines'),
      cell: ({ row }) => row.original.line_count,
    },
    {
      id: 'updated',
      accessorKey: 'updated_at',
      header: t('priceLists.col.updated'),
      cell: ({ row }) => formatIso(row.original.updated_at, 'yyyy-MM-dd HH:mm'),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button type="button" size="sm" variant="outline" asChild>
          <Link to={`/catalog/price-lists/${row.original.id}`}>{t('actions.open')}</Link>
        </Button>
      ),
    },
  ]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('priceLists.title')}</h1>
        {canUpdate ? (
          <Button type="button" asChild>
            <Link to="/catalog/price-lists/new">{t('priceLists.create')}</Link>
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
