import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, defineColumns } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';

import type { PayslipRead } from '../../api';
import { payslipsQueryOptions } from '../../queries';

export default function ApprovalsQueue() {
  const { t } = useTranslation('payroll');
  const { data: all = [], isLoading, isError, refetch } = useQuery(payslipsQueryOptions('draft'));
  const rows = useMemo(() => all.filter((p) => p.status === 'draft'), [all]);

  const columns = useMemo(
    () =>
      defineColumns<PayslipRead>()([
        { id: 'id', accessorKey: 'id', header: t('col.id') },
        {
          id: 'emp',
          header: t('col.employee'),
          cell: ({ row }) => row.original.employee_profile_id,
        },
        {
          id: 'period',
          header: t('col.period'),
          cell: ({ row }) => `${row.original.period_start} → ${row.original.period_end}`,
        },
        {
          id: 'net',
          header: t('col.net'),
          cell: ({ row }) => String(row.original.net_amount),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="icon" variant="ghost" asChild>
              <Link to={`/payroll/runs/${row.original.id}`} aria-label={t('actions.detail')}>
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
      <h1 className="text-xl font-semibold">{t('approvals.title')}</h1>
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
