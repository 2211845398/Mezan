import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';

import type { TransferRead } from '../../api';
import { useTransfersListQuery } from '../../queries';

export default function TransfersList() {
  const { t } = useTranslation('inventory');
  const canUpdate = usePermission('inventory', 'update');
  const { data: rows = [], isLoading, isError, refetch } = useTransfersListQuery({ limit: 200, offset: 0 });

  const columns = defineColumns<TransferRead>()([
    { id: 'id', accessorKey: 'id', header: 'ID' },
    { id: 'from', accessorKey: 'from_branch_id', header: t('transfers.col.from') },
    { id: 'to', accessorKey: 'to_branch_id', header: t('transfers.col.to') },
    { id: 'status', accessorKey: 'status', header: t('transfers.col.status') },
    {
      id: 'at',
      accessorKey: 'created_at',
      header: t('transfers.col.created'),
      cell: ({ row }) => formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm'),
    },
    {
      id: 'a',
      header: '',
      cell: ({ row }) => (
        <Button type="button" size="sm" variant="outline" asChild>
          <Link to={`/inventory/transfers/${row.original.id}`}>{t('actions.open')}</Link>
        </Button>
      ),
    },
  ]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('transfers.title')}</h1>
        {canUpdate ? (
          <Button type="button" asChild>
            <Link to="/inventory/transfers/new">{t('transfers.new')}</Link>
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
