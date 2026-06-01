import { useQuery } from '@tanstack/react-query';
import { Activity, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';
import { inclusiveCalendarDaySpan } from '@/lib/date';

import type { LeaveRequestRead } from '../../api';
import { leaveRequestRowSearchValue } from '../../lib/hrTableSearch';
import { formatVacationBalanceRemaining } from '../../lib/leaveBalanceDisplay';
import { employeesPickerQueryOptions, leaveListQueryOptions } from '../../queries';
import LeaveApproveDrawer from './LeaveApproveDrawer';

export default function LeaveList() {
  const { t, i18n } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
  const canApprove = usePermission('employees', 'approve');
  const [urlQuery, urlActions] = useTableUrlState();
  const [status, setStatus] = useState<string>('pending');
  const st = status === 'all' ? undefined : status;
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    leaveListQueryOptions(st === undefined ? {} : { status: st }),
  );
  const { data: emps = [] } = useQuery(employeesPickerQueryOptions());
  const [sel, setSel] = useState<LeaveRequestRead | null>(null);
  const [open, setOpen] = useState(false);

  const employeeById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);

  const columns = useMemo(() => {
    const tHrAr = i18n.getFixedT('ar', 'hr');
    const tHrEn = i18n.getFixedT('en', 'hr');
    return defineColumns<LeaveRequestRead>()([
      {
        id: 'emp',
        header: t('leave.col.employee'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email, String(row.employee_profile_id)]
            .filter(Boolean)
            .join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => {
          const ep = employeeById.get(row.original.employee_profile_id);
          return ep?.user_full_name ?? ep?.user_email ?? `#${row.original.employee_profile_id}`;
        },
      },
      {
        id: 'leave_start',
        accessorKey: 'start_date',
        header: t('leave.col.from'),
      },
      {
        id: 'leave_end',
        accessorKey: 'end_date',
        header: t('leave.col.to'),
      },
      {
        id: 'days',
        header: t('leave.col.days'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) =>
          String(inclusiveCalendarDaySpan(row.original.start_date, row.original.end_date)),
      },
      {
        id: 'balance',
        header: t('leave.col.balance'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => formatVacationBalanceRemaining(row.original.vacation_balance_remaining),
      },
      {
        id: 'reason',
        header: t('leave.col.reason'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => row.original.reason ?? '—',
      },
      {
        id: 'status',
        header: t('leave.filter_status'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) =>
          t(`leave.st.${row.original.status}`, { defaultValue: row.original.status }),
      },
      {
        id: 'act',
        header: t('leave.col.actions'),
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" asChild title={t('leave.col.performance')}>
              <Link to={`/hr/employees/${row.original.employee_profile_id}/performance`}>
                <Activity className="size-4" aria-hidden />
              </Link>
            </Button>
            {canApprove && row.original.status === 'pending' ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setSel(row.original);
                  setOpen(true);
                }}
              >
                {t('leave.review')}
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">
                {t(`leave.st.${row.original.status}`, { defaultValue: row.original.status })}
              </span>
            )}
          </div>
        ),
      },
    ]);
  }, [canApprove, employeeById, i18n, t]);

  const toolbarFilters = (
    <div
      dir={i18n.dir()}
      className="flex w-full min-w-0 flex-1 flex-wrap items-end gap-2 sm:max-w-2xl"
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="leave-table-search"
            type="search"
            value={urlQuery.q}
            onChange={(e) => urlActions.setQ(e.target.value)}
            aria-label={tc('table.search_placeholder')}
            className="h-9 ps-9"
            dir={i18n.dir()}
          />
          {urlQuery.q ? (
            <button
              type="button"
              onClick={() => urlActions.setQ('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={tc('actions.clear')}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      <div className="grid shrink-0 gap-1">
        <Label htmlFor="leave-status-filter" className="text-sm">
          {t('leave.filter_status')}
        </Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger
            id="leave-status-filter"
            className="h-9 w-[9.5rem] justify-between font-normal rtl:flex-row-reverse"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir={i18n.dir()}>
            <SelectItem value="pending">{t('leave.st.pending')}</SelectItem>
            <SelectItem value="approved">{t('leave.st.approved')}</SelectItem>
            <SelectItem value="rejected">{t('leave.st.rejected')}</SelectItem>
            <SelectItem value="all">{t('leave.st.all')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('leave.title')} />
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        showSearch={false}
        toolbarLeading={toolbarFilters}
      />
      <LeaveApproveDrawer open={open} onOpenChange={setOpen} leave={sel} />
    </div>
  );
}
