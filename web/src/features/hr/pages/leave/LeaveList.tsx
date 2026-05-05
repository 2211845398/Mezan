import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { formatIso, inclusiveCalendarDaySpan } from '@/lib/date';

import type { LeaveRequestRead } from '../../api';
import { leaveRequestRowSearchValue } from '../../lib/hrTableSearch';
import { employeesQueryOptions,leaveListQueryOptions } from '../../queries';
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
        id: 'id',
        header: t('leave.col.id'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email, String(row.employee_profile_id)]
            .filter(Boolean)
            .join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => row.original.id,
      },
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
        id: 'created',
        header: t('leave.col.requested_at'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => formatIso(row.original.created_at, 'yyyy-MM-dd HH:mm'),
      },
      {
        id: 'type',
        header: t('leave.col.type'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => t(`leave.type.${row.original.leave_type}`, { defaultValue: row.original.leave_type }),
      },
      {
        id: 'status',
        header: t('leave.col.status'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => t(`leave.st.${row.original.status}`, { defaultValue: row.original.status }),
      },
      {
        id: 'from',
        header: t('leave.col.from'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => row.original.start_date,
      },
      {
        id: 'to',
        header: t('leave.col.to'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => row.original.end_date,
      },
      {
        id: 'days',
        header: t('leave.col.days'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) => String(inclusiveCalendarDaySpan(row.original.start_date, row.original.end_date)),
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
        id: 'reviewer',
        header: t('leave.col.reviewed_by'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) =>
          row.original.reviewed_by_user_id != null ? `#${row.original.reviewed_by_user_id}` : '—',
      },
      {
        id: 'reviewed_at',
        header: t('leave.col.reviewed_at'),
        accessorFn: (row) => {
          const ep = employeeById.get(row.employee_profile_id);
          const employeeText = [ep?.user_full_name, ep?.user_email].filter(Boolean).join(' ');
          return leaveRequestRowSearchValue(row, { employeeText, tHrAr, tHrEn });
        },
        cell: ({ row }) =>
          row.original.reviewed_at ? formatIso(row.original.reviewed_at, 'yyyy-MM-dd HH:mm') : '—',
      },
      {
        id: 'act',
        header: t('leave.col.actions'),
        enableGlobalFilter: false,
        cell: ({ row }) =>
          canApprove && row.original.status === 'pending' ? (
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
