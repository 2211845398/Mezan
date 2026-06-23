import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { listBranches, listPendingOnboarding } from '@/features/admin/api';
import { getBranchLabel } from '@/features/admin/lib/branchLabels';
import { roleCodeLabel } from '@/features/admin/lib/roleLabels';
import { adminKeys } from '@/features/admin/queries';
import type { UserOnboardingRead } from '@/features/admin/types';
import { formatIso } from '@/lib/date';

import { pendingOnboardingRowSearchValue } from '../../lib/hrTableSearch';

export default function PendingOnboardingList() {
  const { t, i18n } = useTranslation('hr');
  const { t: tAdmin } = useTranslation('admin');

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: adminKeys.onboardingList(null),
    queryFn: listPendingOnboarding,
  });

  const columns = useMemo(() => {
    const tRoleAr = i18n.getFixedT('ar', 'admin');
    const tRoleEn = i18n.getFixedT('en', 'admin');
    const tStatusAr = i18n.getFixedT('ar', 'admin');
    const tStatusEn = i18n.getFixedT('en', 'admin');
    const searchOpts = { branches, tRoleAr, tRoleEn, tStatusAr, tStatusEn };
    return defineColumns<UserOnboardingRead>()([
      {
        id: 'email',
        header: tAdmin('users.col.email'),
        accessorFn: (row) => pendingOnboardingRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.user_email ?? '—',
      },
      {
        id: 'full_name',
        header: tAdmin('users.col.full_name'),
        accessorFn: (row) => pendingOnboardingRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.user_full_name ?? '—',
      },
      {
        id: 'user_status',
        header: tAdmin('users.col.status'),
        accessorFn: (row) => pendingOnboardingRowSearchValue(row, searchOpts),
        cell: ({ row }) => {
          const s = row.original.user_status ?? '';
          return s ? tAdmin(`users.user_status.${s}`, { defaultValue: s }) : '—';
        },
      },
      {
        id: 'branch',
        header: tAdmin('users.col.branch'),
        accessorFn: (row) => pendingOnboardingRowSearchValue(row, searchOpts),
        cell: ({ row }) => getBranchLabel(branches, row.original.user_branch_id ?? null),
      },
      {
        id: 'role',
        header: tAdmin('users.col.role'),
        accessorFn: (row) => pendingOnboardingRowSearchValue(row, searchOpts),
        cell: ({ row }) => {
          const code = (row.original.user_role_code ?? '').trim();
          const name = (row.original.user_role_name ?? '').trim();
          if (!code && !name) return '—';
          return code ? roleCodeLabel(tAdmin, code, name || code) : name;
        },
      },
      {
        id: 'requested_by',
        header: t('pending.requested_by'),
        accessorFn: (row) => pendingOnboardingRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.requested_by_name ?? '—',
      },
      {
        id: 'assigned_hr',
        header: t('pending.assigned_hr'),
        accessorFn: (row) => pendingOnboardingRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.assigned_hr_name ?? '—',
      },
      {
        id: 'created',
        header: t('pending.created'),
        accessorFn: (row) => pendingOnboardingRowSearchValue(row, searchOpts),
        cell: ({ row }) =>
          row.original.created_at ? formatIso(row.original.created_at, 'yyyy-MM-dd') : '—',
      },
    ]);
  }, [branches, i18n, t, tAdmin]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('pending.title')}
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
        getRowHref={(row) => `/hr/employees/pending/${row.id}`}
      />
    </div>
  );
}
