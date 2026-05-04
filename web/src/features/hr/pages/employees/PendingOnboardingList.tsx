import { useQuery } from '@tanstack/react-query';
import { ArrowRight, UserCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { listPendingOnboarding } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import type { UserOnboardingRead } from '@/features/admin/types';
import { formatIso } from '@/lib/date';

export default function PendingOnboardingList() {
  const { t } = useTranslation('hr');
  const { t: tAdmin } = useTranslation('admin');

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: adminKeys.onboardingList(null),
    queryFn: listPendingOnboarding,
  });

  const columns = useMemo(
    () =>
      defineColumns<UserOnboardingRead>()([
        {
          id: 'name',
          header: tAdmin('users.col.full_name'),
          cell: ({ row }) => row.original.user_full_name ?? row.original.user_email ?? '—',
        },
        {
          id: 'email',
          header: tAdmin('users.col.email'),
          cell: ({ row }) => row.original.user_email ?? '—',
        },
        {
          id: 'role',
          header: tAdmin('users.col.role'),
          cell: ({ row }) =>
            row.original.user_role_name || row.original.user_role_code || '—',
        },
        {
          id: 'branch',
          header: tAdmin('users.col.branch'),
          cell: ({ row }) => row.original.user_branch_name ?? '—',
        },
        {
          id: 'requested_by',
          header: t('pending.requested_by'),
          cell: ({ row }) => row.original.requested_by_name ?? '—',
        },
        {
          id: 'assigned_hr',
          header: t('pending.assigned_hr'),
          cell: ({ row }) => row.original.assigned_hr_name ?? '—',
        },
        {
          id: 'created',
          header: t('pending.created'),
          cell: ({ row }) =>
            row.original.created_at ? formatIso(row.original.created_at, 'yyyy-MM-dd') : '—',
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to={`/hr/employees/pending/${row.original.id}`}>
                <UserCheck className="me-2 size-4" />
                {t('pending.review')}
              </Link>
            </Button>
          ),
        },
      ]),
    [t, tAdmin],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('pending.title')}
        subtitle={t('pending.subtitle')}
        actions={
          <Button variant="outline" asChild>
            <Link to="/hr/employees">
              <ArrowRight className="me-2 size-4" />
              {t('employees.title')}
            </Link>
          </Button>
        }
      />

      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-sm text-muted-foreground">{t('pending.empty')}</p>}
      />
    </div>
  );
}
