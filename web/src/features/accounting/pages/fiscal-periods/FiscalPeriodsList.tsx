import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import type { FiscalPeriodRead } from '../../api';
import { fiscalPeriodsQueryOptions } from '../../queries';

type FiscalPeriodRow = FiscalPeriodRead & {
  period_start?: string;
  period_end?: string;
  closed_at?: string;
};

function periodDateSlice(value: string | undefined): string {
  return value?.slice(0, 10) ?? '';
}

export default function FiscalPeriodsList() {
  const { t } = useTranslation('accounting');
  const { data: rows = [], isLoading, isError, refetch } = useQuery(fiscalPeriodsQueryOptions());

  const columns = useMemo(
    () =>
      defineColumns<FiscalPeriodRead>()([
        {
          id: 'key',
          accessorKey: 'period_key',
          header: t('fiscal.col.key'),
          cell: ({ row }) => (
            <span className="font-medium num-latin">{row.original.period_key}</span>
          ),
        },
        {
          id: 'start',
          header: t('fiscal.col.start'),
          accessorFn: (row) => periodDateSlice((row as FiscalPeriodRow).period_start),
          cell: ({ row }) => periodDateSlice((row.original as FiscalPeriodRow).period_start) || '—',
        },
        {
          id: 'end',
          header: t('fiscal.col.end'),
          accessorFn: (row) => periodDateSlice((row as FiscalPeriodRow).period_end),
          cell: ({ row }) => periodDateSlice((row.original as FiscalPeriodRow).period_end) || '—',
        },
        {
          id: 's',
          accessorKey: 'status',
          header: t('fiscal.col.status'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.status}
              label={t(`fiscal.status_label.${row.original.status}`, row.original.status)}
            />
          ),
        },
        {
          id: 'closed_at',
          header: t('fiscal.col.closed_at'),
          accessorFn: (row) => periodDateSlice((row as FiscalPeriodRow).closed_at),
          cell: ({ row }) => periodDateSlice((row.original as FiscalPeriodRow).closed_at) || '—',
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('fiscal.title')} />
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        searchPlaceholder={t('fiscal.search_placeholder')}
        getRowHref={(row) =>
          `/accounting/fiscal-periods/${encodeURIComponent(row.period_key)}`
        }
      />
    </div>
  );
}
