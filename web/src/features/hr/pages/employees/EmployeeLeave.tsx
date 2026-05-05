import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inclusiveCalendarDaySpan } from '@/lib/date';

import type { LeaveRequestRead } from '../../api';
import { formatVacationBalanceRemaining } from '../../lib/leaveBalanceDisplay';
import { leaveListQueryOptions } from '../../queries';

export default function EmployeeLeave() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const { t } = useTranslation('hr');

  const [status, setStatus] = useState<string>('all');

  const { data: leaves = [], isLoading } = useQuery({
    ...leaveListQueryOptions({
      ...(status !== 'all' ? { status } : {}),
      employee_profile_id: employeeId,
    }),
    enabled: !Number.isNaN(employeeId),
  });

  const columns = useMemo(
    () =>
      defineColumns<LeaveRequestRead>()([
        {
          id: 'type',
          accessorKey: 'leave_type',
          header: t('leave.col.type'),
          cell: ({ row }) => t(`leave.type.${row.original.leave_type}`, { defaultValue: row.original.leave_type }),
        },
        {
          id: 'status',
          accessorKey: 'status',
          header: t('leave.col.status'),
          cell: ({ row }) => (
            <span
              className={
                row.original.status === 'approved'
                  ? 'text-green-600'
                  : row.original.status === 'pending'
                    ? 'text-yellow-600'
                    : 'text-red-600'
              }
            >
              {t(`leave.st.${row.original.status}`, { defaultValue: row.original.status })}
            </span>
          ),
        },
        {
          id: 'period',
          header: t('leave.col.period'),
          cell: ({ row }) => `${row.original.start_date} – ${row.original.end_date}`,
        },
        {
          id: 'days',
          header: t('leave.col.days'),
          cell: ({ row }) =>
            `${inclusiveCalendarDaySpan(row.original.start_date, row.original.end_date)}`,
        },
        {
          id: 'balance',
          header: t('leave.col.balance'),
          cell: ({ row }) => formatVacationBalanceRemaining(row.original.vacation_balance_remaining),
        },
        {
          id: 'reason',
          header: t('leave.col.reason'),
          cell: ({ row }) => row.original.reason || '—',
        },
        {
          id: 'reviewed',
          header: t('leave.col.reviewed_by'),
          cell: ({ row }) =>
            row.original.reviewed_by_user_id ? `User #${row.original.reviewed_by_user_id}` : '—',
        },
      ]),
    [t],
  );

  // Stats
  const stats = useMemo(() => {
    const total = leaves.length;
    const pending = leaves.filter(l => l.status === 'pending').length;
    const approved = leaves.filter(l => l.status === 'approved').length;
    const rejected = leaves.filter(l => l.status === 'rejected').length;
    return { total, pending, approved, rejected };
  }, [leaves]);

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <Label>{t('leave.filter_status')}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('leave.st.all')}</SelectItem>
                <SelectItem value="pending">{t('leave.st.pending')}</SelectItem>
                <SelectItem value="approved">{t('leave.st.approved')}</SelectItem>
                <SelectItem value="rejected">{t('leave.st.rejected')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('leave.stats.total')}</p>
          <p className="text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('leave.st.pending')}</p>
          <p className="text-2xl font-semibold text-yellow-600">{stats.pending}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('leave.st.approved')}</p>
          <p className="text-2xl font-semibold text-green-600">{stats.approved}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('leave.st.rejected')}</p>
          <p className="text-2xl font-semibold text-red-600">{stats.rejected}</p>
        </div>
      </div>

      <DataTable
        mode="client"
        columns={columns}
        data={leaves}
        isLoading={isLoading}
        emptyState={<p className="text-sm text-muted-foreground">{t('leave.empty')}</p>}
      />
    </div>
  );
}
