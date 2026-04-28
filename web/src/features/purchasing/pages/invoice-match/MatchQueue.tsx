import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { InvoiceScanRead } from '../../api';
import { matchQueueQueryOptions } from '../../queries';

function mapStatus(scan: InvoiceScanRead, t: (k: string) => string): string {
  if (scan.status === 'validated') return t('match.map_ui.validated');
  if (scan.status === 'failed') return t('match.map_ui.failed');
  if (scan.status === 'needs_review') return t('match.map_ui.needs_review');
  return scan.status;
}

export default function MatchQueue() {
  const { t } = useTranslation('purchasing');
  const [status, setStatus] = useState<string>('needs_review');
  const statusParam = status === 'all' ? undefined : status;
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    matchQueueQueryOptions(statusParam),
  );

  const columns = useMemo(
    () =>
      defineColumns<InvoiceScanRead>()([
        { id: 'id', accessorKey: 'id', header: t('match.col.id') },
        {
          id: 'status',
          header: t('match.col.status'),
          cell: ({ row }) => mapStatus(row.original, t),
        },
        { id: 'provider', accessorKey: 'provider', header: t('match.col.provider') },
        {
          id: 'created',
          accessorKey: 'created_at',
          header: t('match.col.created'),
          cell: ({ row }) => row.original.created_at?.slice(0, 19) ?? '—',
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="icon" variant="ghost" asChild>
              <Link to={`/purchasing/invoice-match/${row.original.id}`} aria-label={t('match.review')}>
                <Eye className="size-4" />
              </Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('match.title')}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="shrink-0">{t('orders.filter_status')}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="needs_review">{t('match.map_ui.needs_review')}</SelectItem>
            <SelectItem value="validated">{t('match.map_ui.validated')}</SelectItem>
            <SelectItem value="failed">{t('match.map_ui.failed')}</SelectItem>
            <SelectItem value="all">{t('orders.all_statuses')}</SelectItem>
          </SelectContent>
        </Select>
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
