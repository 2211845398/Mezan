import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Eye, UserCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { NavAttentionBadge } from '@/components/layout/NavAttentionBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { listBranches, listPendingOnboarding } from '@/features/admin/api';
import { getBranchLabel } from '@/features/admin/lib/branchLabels';
import { roleCodeLabel } from '@/features/admin/lib/roleLabels';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';

import { type EmployeeProfileRead } from '../../api';
import { employeeProfileRowSearchValue } from '../../lib/hrTableSearch';
import { employeesQueryOptions } from '../../queries';

export default function EmployeesList() {
  const { t, i18n } = useTranslation('hr');
  const canOnboardingRead = usePermission('onboarding', 'read');
  const { data: rows = [], isLoading, isError, refetch } = useQuery(employeesQueryOptions());
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: pendingOnboarding = [] } = useQuery({
    queryKey: adminKeys.onboardingList(null),
    queryFn: listPendingOnboarding,
    enabled: canOnboardingRead,
    staleTime: 30_000,
  });
  const onboardingPendingCount = pendingOnboarding.length;

  const { t: tAdmin } = useTranslation('admin');

  const columns = useMemo(() => {
    const tStatusAr = i18n.getFixedT('ar', 'admin');
    const tStatusEn = i18n.getFixedT('en', 'admin');
    const tRoleAr = i18n.getFixedT('ar', 'admin');
    const tRoleEn = i18n.getFixedT('en', 'admin');
    const searchOpts = { branches, tStatusAr, tStatusEn, tRoleAr, tRoleEn };
    return defineColumns<EmployeeProfileRead>()([
      {
        id: 'email',
        header: tAdmin('users.col.email'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.user_email ?? '—',
      },
      {
        id: 'full_name',
        header: tAdmin('users.col.full_name'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.user_full_name ?? row.original.user_email ?? `User #${row.original.user_id}`,
      },
      {
        id: 'status',
        header: tAdmin('users.col.status'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => {
          const s = row.original.user_status ?? '';
          return s ? tAdmin(`users.user_status.${s}`, { defaultValue: s }) : '—';
        },
      },
      {
        id: 'branch',
        header: tAdmin('users.col.branch'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => getBranchLabel(branches, row.original.user_branch_id ?? null),
      },
      {
        id: 'role',
        header: tAdmin('users.col.role'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => {
          const code = (row.original.user_role_code ?? '').trim();
          const name = (row.original.user_role_name ?? '').trim();
          if (!code && !name) return '—';
          return code ? roleCodeLabel(tAdmin, code, name || code) : name;
        },
      },
      {
        id: 'hire_date',
        header: t('employees.col.hire_date'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.hire_date,
      },
      {
        id: 'compensation',
        header: t('employees.col.compensation'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => {
          const parts: string[] = [];
          if (row.original.base_salary != null && row.original.base_salary !== '') {
            parts.push(String(row.original.base_salary));
          }
          if (row.original.hourly_rate != null && row.original.hourly_rate !== '') {
            parts.push(String(row.original.hourly_rate));
          }
          return parts.length ? parts.join(' · ') : '—';
        },
      },
      {
        id: 'actions',
        header: '',
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <Button type="button" size="icon" variant="ghost" asChild>
            <Link to={`/hr/employees/${row.original.id}`} aria-label={t('employees.view')}>
              <Eye className="size-4" />
            </Link>
          </Button>
        ),
      },
    ]);
  }, [branches, i18n, t, tAdmin]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('employees.title')}
        actions={
          <Button variant="outline" asChild>
            <Link
              to="/hr/employees/pending"
              className="relative inline-flex items-center gap-2 overflow-visible"
            >
              <UserCheck className="size-4 shrink-0" aria-hidden />
              <span>{t('pending.title')}</span>
              <ArrowRight className="size-4 shrink-0" aria-hidden />
              {onboardingPendingCount > 0 ? (
                <span
                  className="pointer-events-none absolute -top-2 z-10 ltr:-end-2 rtl:-start-2"
                  aria-hidden
                >
                  <NavAttentionBadge count={onboardingPendingCount} />
                </span>
              ) : null}
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
      />
    </div>
  );
}
