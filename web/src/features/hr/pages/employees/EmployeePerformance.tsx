import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { listBranches } from '@/features/admin/api';
import { getBranchLabel } from '@/features/admin/lib/branchLabels';
import { adminKeys } from '@/features/admin/queries';
import { formatIso, hoursBetween, now, utcCalendarDayKey } from '@/lib/date';

import type { AttendanceLogRead, LeaveRequestRead } from '../../api';
import { attendanceLogRowSearchValue } from '../../lib/hrTableSearch';
import { attendanceListAllQueryOptions, employeeQueryOptions, leaveListQueryOptions } from '../../queries';

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
}

function StatCard({ label, value, subtext }: StatCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {subtext ? <p className="text-xs text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

export default function EmployeePerformance() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const { t } = useTranslation('hr');

  const { data: employee } = useQuery({
    ...employeeQueryOptions(employeeId),
    enabled: !Number.isNaN(employeeId),
  });

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  // Get attendance data for last 30 days
  const dateFrom = utcCalendarDayKey(subDays(now(), 30));
  const dateTo = utcCalendarDayKey(now());

  const { data: attendance = [] } = useQuery({
    ...attendanceListAllQueryOptions({
      date_from: dateFrom,
      date_to: dateTo,
      employee_profile_id: employeeId,
    }),
    enabled: !Number.isNaN(employeeId),
  });

  // Get leave data
  const { data: leaves = [] } = useQuery({
    ...leaveListQueryOptions({ employee_profile_id: employeeId }),
    enabled: !Number.isNaN(employeeId),
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalShifts = attendance.length;
    const completedShifts = attendance.filter(a => a.clock_out_at != null).length;
    const openShifts = totalShifts - completedShifts;

    // Calculate total hours
    let totalHours = 0;
    attendance.forEach(a => {
      if (a.clock_in_at && a.clock_out_at) {
        totalHours += hoursBetween(a.clock_in_at, a.clock_out_at);
      }
    });

    // Overtime detection (>10 hours)
    const overtimeDays = attendance.filter(a => {
      if (!a.clock_in_at || !a.clock_out_at) return false;
      return hoursBetween(a.clock_in_at, a.clock_out_at) > 10;
    }).length;

    // Leave metrics
    const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
    const approvedLeaves = leaves.filter(l => l.status === 'approved').length;

    return {
      totalShifts,
      completedShifts,
      openShifts,
      totalHours: Math.round(totalHours * 10) / 10,
      overtimeDays,
      pendingLeaves,
      approvedLeaves,
      avgHoursPerShift: completedShifts > 0 ? Math.round((totalHours / completedShifts) * 10) / 10 : 0,
    };
  }, [attendance, leaves]);

  // Recent activity table columns
  const activityColumns = useMemo(
    () =>
      defineColumns<AttendanceLogRead>()([
        {
          id: 'date',
          header: t('attendance.col.date'),
          accessorFn: (row) => {
            const employeeText = [employee?.user_full_name, employee?.user_email].filter(Boolean).join(' ');
            const branchText = getBranchLabel(branches, row.branch_id);
            const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
            const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
            const openText = row.clock_out_at ? '' : t('performance.missing_clock_out');
            return attendanceLogRowSearchValue(row, { employeeText, branchText, inText, outText, openText });
          },
          cell: ({ row }) =>
            row.original.clock_in_at ? formatIso(row.original.clock_in_at, 'yyyy-MM-dd') : '—',
        },
        {
          id: 'in',
          header: t('attendance.col.in'),
          accessorFn: (row) => {
            const employeeText = [employee?.user_full_name, employee?.user_email].filter(Boolean).join(' ');
            const branchText = getBranchLabel(branches, row.branch_id);
            const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
            const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
            const openText = row.clock_out_at ? '' : t('performance.missing_clock_out');
            return attendanceLogRowSearchValue(row, { employeeText, branchText, inText, outText, openText });
          },
          cell: ({ row }) =>
            row.original.clock_in_at ? formatIso(row.original.clock_in_at, 'HH:mm') : '—',
        },
        {
          id: 'out',
          header: t('attendance.col.out'),
          accessorFn: (row) => {
            const employeeText = [employee?.user_full_name, employee?.user_email].filter(Boolean).join(' ');
            const branchText = getBranchLabel(branches, row.branch_id);
            const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
            const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
            const openText = row.clock_out_at ? '' : t('performance.missing_clock_out');
            return attendanceLogRowSearchValue(row, { employeeText, branchText, inText, outText, openText });
          },
          cell: ({ row }) =>
            row.original.clock_out_at
              ? formatIso(row.original.clock_out_at, 'HH:mm')
              : t('performance.missing_clock_out'),
        },
        {
          id: 'hours',
          header: t('performance.hours'),
          accessorFn: (row) => {
            const employeeText = [employee?.user_full_name, employee?.user_email].filter(Boolean).join(' ');
            const branchText = getBranchLabel(branches, row.branch_id);
            const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
            const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
            const openText = row.clock_out_at ? '' : t('performance.missing_clock_out');
            return attendanceLogRowSearchValue(row, { employeeText, branchText, inText, outText, openText });
          },
          cell: ({ row }) => {
            if (!row.original.clock_in_at || !row.original.clock_out_at) return '—';
            const hours = hoursBetween(row.original.clock_in_at, row.original.clock_out_at);
            return `${Math.round(hours * 10) / 10}h`;
          },
        },
      ]),
    [branches, employee?.user_email, employee?.user_full_name, t],
  );

  return (
    <div className="space-y-6">
      <SectionCard title={t('performance.summary_30_days')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('performance.total_shifts')}
            value={String(metrics.totalShifts)}
            subtext={`${metrics.completedShifts} ${t('performance.completed')}`}
          />
          <StatCard
            label={t('performance.total_hours')}
            value={`${metrics.totalHours}h`}
            subtext={`${metrics.avgHoursPerShift}h ${t('performance.avg_per_shift')}`}
          />
          <StatCard
            label={t('performance.overtime_days')}
            value={String(metrics.overtimeDays)}
            {...(metrics.overtimeDays > 0 ? { subtext: t('performance.overtime_warning') } : {})}
          />
          <StatCard
            label={t('performance.leave_requests')}
            value={`${metrics.approvedLeaves}`}
            subtext={`${metrics.pendingLeaves} ${t('performance.pending')}`}
          />
        </div>
      </SectionCard>

      {metrics.openShifts > 0 && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
          <p className="font-medium">{t('performance.open_shifts_alert')}</p>
          <p className="text-sm">
            {t('performance.open_shifts_count', { count: metrics.openShifts })}
          </p>
        </div>
      )}

      <SectionCard title={t('performance.recent_attendance')}>
        <DataTable
          mode="client"
          columns={activityColumns}
          data={attendance.slice(0, 10)}
          emptyState={<p className="text-sm text-muted-foreground">{t('performance.no_recent_attendance')}</p>}
        />
      </SectionCard>

      <SectionCard title={t('performance.leave_summary')}>
        <div className="space-y-2">
          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('performance.no_leave')}</p>
          ) : (
            <ul className="space-y-2">
              {leaves.slice(0, 5).map((leave: LeaveRequestRead) => (
                <li key={leave.id} className="flex justify-between rounded border p-2 text-sm">
                  <span>
                    {t(`leave.type.${leave.leave_type}`, { defaultValue: leave.leave_type })} ({leave.start_date} -{' '}
                    {leave.end_date})
                  </span>
                  <span
                    className={
                      leave.status === 'approved'
                        ? 'text-green-600'
                        : leave.status === 'pending'
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }
                  >
                    {t(`leave.st.${leave.status}`, { defaultValue: leave.status })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
