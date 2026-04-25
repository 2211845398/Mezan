import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { formatIso } from '@/lib/date';

import type { InvoiceScanRead } from '../../api';
import { useInvoiceScansListQuery } from '../../queries';

function statusChip(t: (k: string) => string, s: string) {
  const key = `scans.status.${s}`;
  return <span className="rounded border px-1.5 py-0.5 text-xs font-medium">{t(key)}</span>;
}

export default function ScansList() {
  const { t } = useTranslation('inventory');
  const { data: rows = [], isLoading, isError, refetch } = useInvoiceScansListQuery({ limit: 200, offset: 0 });

  const columns = defineColumns<InvoiceScanRead>()([
    { id: 'id', accessorKey: 'id', header: 'ID' },
    {
      id: 'status',
      header: t('scans.col.status'),
      cell: ({ row }) => statusChip(t, row.original.status),
    },
    { id: 'src', accessorKey: 'source_type', header: t('scans.col.source') },
    { id: 'prov', accessorKey: 'provider', header: t('scans.col.provider') },
    {
      id: 'at',
      accessorKey: 'created_at',
      header: t('scans.col.created'),
      cell: ({ row }) => formatIso(String(row.original.created_at), 'yyyy-MM-dd HH:mm'),
    },
    {
      id: 'a',
      header: '',
      cell: ({ row }) => (
        <Button type="button" size="sm" asChild>
          <Link to={`/inventory/scans/${row.original.id}`}>{t('scans.review')}</Link>
        </Button>
      ),
    },
  ]);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('scans.title')}</h1>
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
