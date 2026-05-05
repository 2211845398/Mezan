import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
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
import { employeesQueryOptions, leaveListQueryOptions } from '../../queries';
import LeaveApproveDrawer from './LeaveApproveDrawer';

export default function LeaveList() {
  const { t, i18n } = useTranslation('hr');
  const canApprove = usePermission('employees', 'approve');
  const [status, setStatus] = useState<string>('pending');
  const st = status === 'all' ? undefined : status;
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    leaveListQueryOptions(st === undefined ? {} : { status: st }),
  );
  const { data: emps = [] } = useQuery(employeesQueryOptions());
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
        id: 'period',
        header: t('leave.col.period'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => `${row.original.start_date} – ${row.original.end_date}`,
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('leave.title')} />
      <div className="grid max-w-md gap-2">
        <Label>{t('leave.filter_status')}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">{t('leave.st.pending')}</SelectItem>
            <SelectItem value="approved">{t('leave.st.approved')}</SelectItem>
            <SelectItem value="rejected">{t('leave.st.rejected')}</SelectItem>
            <SelectItem value="all">{t('leave.st.all')}</SelectItem>
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
      <LeaveApproveDrawer open={open} onOpenChange={setOpen} leave={sel} />
    </div>
  );
}
