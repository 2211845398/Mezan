import { useQuery } from '@tanstack/react-query';

import { paginatedParams } from '@/api/pagination';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
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
import { formatCurrency } from '@/lib/format';

import { type EmployeeProfileRead } from '../../api';
import { employeeProfileRowSearchValue } from '../../lib/hrTableSearch';
import { employeesQueryOptions } from '../../queries';

const DISPLAY_CURRENCY = 'USD';

export default function EmployeesList() {
  const { t, i18n } = useTranslation('hr');
  const canOnboardingRead = usePermission('onboarding', 'read');
  const [urlQuery] = useTableUrlState({ pageSize: 20 });
  const { limit, offset } = paginatedParams(urlQuery.page, urlQuery.pageSize);
  const q = urlQuery.q.trim();
  const { data, isLoading, isError, refetch } = useQuery(
    employeesQueryOptions({ limit, offset, ...(q ? { q } : {}) }),
  );
  const rows = data?.items ?? [];
  const totalRows = data?.total ?? 0;
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
        id: 'full_name',
        header: tAdmin('users.col.full_name'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.user_full_name ?? row.original.user_email ?? `User #${row.original.user_id}`,
      },
      {
        id: 'email',
        header: tAdmin('users.col.email'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => row.original.user_email ?? '—',
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
        id: 'identity_document',
        header: t('employees.col.identity_document'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => {
          const typ = row.original.identity_document_type?.trim();
          const hasImg = Boolean(row.original.identity_document_image_url);
          if (!typ && !hasImg) return '—';
          const label = typ
            ? t(`employees.form.identity_doc_${typ}`, { defaultValue: typ })
            : '—';
          return (
            <span className="inline-flex max-w-[14rem] items-center gap-1 truncate">
              <span className="truncate">{label}</span>
              {hasImg ? (
                <span className="shrink-0 text-muted-foreground" title={t('employees.form.identity_document_preview')}>
                  ✓
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: 'compensation',
        header: t('employees.col.monthly_salary'),
        accessorFn: (row) => employeeProfileRowSearchValue(row, searchOpts),
        cell: ({ row }) => {
          const salary = row.original.base_salary;
          if (salary == null || salary === '') return '—';
          return (
            <span dir="ltr" className="tabular-nums num-latin">
              {formatCurrency(salary, DISPLAY_CURRENCY)}
            </span>
          );
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
        mode="server"
        defaultUrlQuery={{ pageSize: 20 }}
        columns={columns}
        data={rows}
        totalRows={totalRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
