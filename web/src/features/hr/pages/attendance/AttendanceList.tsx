import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateField } from '@/components/shared/form/DateField';
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
import { listBranches } from '@/features/admin/api';
import { getBranchLabel } from '@/features/admin/lib/branchLabels';
import { adminKeys } from '@/features/admin/queries';
import { formatIso, now, utcCalendarDayKey } from '@/lib/date';

import type { AttendanceLogRead } from '../../api';
import { attendanceLogRowSearchValue } from '../../lib/hrTableSearch';
import {
  attendanceListQueryOptions,
  attendanceSummaryQueryOptions,
  employeesPickerQueryOptions,
} from '../../queries';

const CATEGORY_FILTERS = ['__all', 'exempt', 'office', 'operational'] as const;
const STATUS_FILTERS = [
  '__all',
  'present',
  'late',
  'absent',
  'open',
  'exempt_log',
  'supplemental',
  'operational_open',
  'operational_late_open',
  'operational_early_close',
  'operational_complete',
  'no_schedule',
] as const;

export default function AttendanceList() {
  const { t } = useTranslation('hr');
  const [dateFrom, setDateFrom] = useState(() => utcCalendarDayKey(subDays(now(), 7)));
  const [dateTo, setDateTo] = useState(() => utcCalendarDayKey(now()));
  const [branchId, setBranchId] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('__all');
  const [statusFilter, setStatusFilter] = useState<string>('__all');

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: emps = [] } = useQuery(employeesPickerQueryOptions());

  const employeeById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);

  const q = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(employeeId ? { employee_profile_id: Number(employeeId) } : {}),
      ...(categoryFilter !== '__all' ? { attendance_category: categoryFilter } : {}),
      ...(statusFilter !== '__all' ? { classification_status: statusFilter } : {}),
    }),
    [dateFrom, dateTo, branchId, employeeId, categoryFilter, statusFilter],
  );

  const { data: rows = [], isLoading, isError, refetch } = useQuery(attendanceListQueryOptions(q));

  const summaryParams = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(employeeId ? { employee_profile_id: Number(employeeId) } : {}),
    }),
    [dateFrom, dateTo, branchId, employeeId],
  );

  const { data: summary } = useQuery(attendanceSummaryQueryOptions(summaryParams));

  const columns = useMemo(
    () =>
      defineColumns<AttendanceLogRead>()([
        { id: 'id', accessorKey: 'id', header: t('attendance.col.id') },
        {
          id: 'employee',
          header: t('attendance.col.employee'),
          accessorFn: (row) => {
            const ep = employeeById.get(row.employee_profile_id);
            const label = ep?.user_full_name ?? ep?.user_email ?? '';
            const branchText = getBranchLabel(branches, row.branch_id);
            const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
            const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
            const openText = row.clock_out_at ? '' : t('attendance.open');
            const cat = row.attendance_category ?? '';
            const st = row.classification_status ?? '';
            return attendanceLogRowSearchValue(row, {
              employeeText: [label, String(row.employee_profile_id), ep?.user_email, cat, st]
                .filter(Boolean)
                .join(' '),
              branchText,
              inText,
              outText,
              openText,
            });
          },
          cell: ({ row }) => {
            const ep = employeeById.get(row.original.employee_profile_id);
            return ep?.user_full_name ?? ep?.user_email ?? `#${row.original.employee_profile_id}`;
          },
        },
        {
          id: 'category',
          header: t('attendance.col.category'),
          accessorFn: (row) =>
            [row.attendance_category, row.classification_status].filter(Boolean).join(' '),
          cell: ({ row }) => row.original.attendance_category ?? '—',
        },
        {
          id: 'status',
          header: t('attendance.col.status'),
          accessorFn: (row) => row.classification_status ?? '',
          cell: ({ row }) => row.original.classification_status ?? '—',
        },
        {
          id: 'branch',
          header: t('attendance.col.branch'),
          accessorFn: (row) => {
            const ep = employeeById.get(row.employee_profile_id);
            const label = ep?.user_full_name ?? ep?.user_email ?? '';
            const branchText = getBranchLabel(branches, row.branch_id);
            const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
            const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
            const openText = row.clock_out_at ? '' : t('attendance.open');
            return attendanceLogRowSearchValue(row, {
              employeeText: label,
              branchText,
              inText,
              outText,
              openText,
            });
          },
          cell: ({ row }) => getBranchLabel(branches, row.original.branch_id) || String(row.original.branch_id),
        },
        {
          id: 'in',
          header: t('attendance.col.in'),
          accessorFn: (row) => {
            const branchText = getBranchLabel(branches, row.branch_id);
            const ep = employeeById.get(row.employee_profile_id);
            const label = ep?.user_full_name ?? ep?.user_email ?? '';
            const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
            const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
            const openText = row.clock_out_at ? '' : t('attendance.open');
            return attendanceLogRowSearchValue(row, {
              employeeText: label,
              branchText,
              inText,
              outText,
              openText,
            });
          },
          cell: ({ row }) =>
            row.original.clock_in_at ? formatIso(row.original.clock_in_at, 'yyyy-MM-dd HH:mm') : '—',
        },
        {
          id: 'out',
          header: t('attendance.col.out'),
          accessorFn: (row) => {
            const branchText = getBranchLabel(branches, row.branch_id);
            const ep = employeeById.get(row.employee_profile_id);
            const label = ep?.user_full_name ?? ep?.user_email ?? '';
            const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
            const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
            const openText = row.clock_out_at ? '' : t('attendance.open');
            return attendanceLogRowSearchValue(row, {
              employeeText: label,
              branchText,
              inText,
              outText,
              openText,
            });
          },
          cell: ({ row }) =>
            row.original.clock_out_at ? formatIso(row.original.clock_out_at, 'yyyy-MM-dd HH:mm') : '—',
        },
        {
          id: 'ot',
          header: t('attendance.col.ot_min'),
          accessorFn: (row) => String(row.overtime_minutes ?? ''),
          cell: ({ row }) => (row.original.overtime_minutes != null ? String(row.original.overtime_minutes) : '—'),
        },
        {
          id: 'impact',
          header: t('attendance.col.payroll_impact'),
          accessorFn: (row) => String(row.payroll_impact_amount ?? ''),
          cell: ({ row }) => (row.original.payroll_impact_amount != null ? String(row.original.payroll_impact_amount) : '—'),
        },
        {
          id: 'open',
          header: t('attendance.col.timesheet'),
          enableGlobalFilter: false,
          cell: ({ row }) => (
            <Button type="button" size="sm" variant="link" asChild>
              <Link to={`/hr/attendance/timesheet/${row.original.employee_profile_id}`}>
                {t('attendance.timesheet_link')}
              </Link>
            </Button>
          ),
        },
      ]),
    [branches, employeeById, t],
  );

  const presentCount = summary?.by_status?.present ?? 0;
  const lateCount = summary?.by_status?.late ?? 0;
  const absentDays = summary?.absent_days ?? 0;
  const otMin = summary?.overtime_minutes_total ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('attendance.title')} />
      {summary ? (
        <div className="grid grid-cols-2 gap-3 min-[520px]:grid-cols-5">
          <SectionCard className="p-4">
            <p className="text-xs text-muted-foreground">{t('attendance.summary.present')}</p>
            <p className="text-2xl font-semibold">{presentCount}</p>
          </SectionCard>
          <SectionCard className="p-4">
            <p className="text-xs text-muted-foreground">{t('attendance.summary.late')}</p>
            <p className="text-2xl font-semibold">{lateCount}</p>
          </SectionCard>
          <SectionCard className="p-4">
            <p className="text-xs text-muted-foreground">{t('attendance.summary.absent_days')}</p>
            <p className="text-2xl font-semibold">{absentDays}</p>
          </SectionCard>
          <SectionCard className="p-4">
            <p className="text-xs text-muted-foreground">{t('attendance.summary.ot_minutes')}</p>
            <p className="text-2xl font-semibold">{Math.round(otMin)}</p>
          </SectionCard>
          <SectionCard className="p-4">
            <p className="text-xs text-muted-foreground">{t('attendance.summary.records')}</p>
            <p className="text-2xl font-semibold">{summary.record_count}</p>
          </SectionCard>
        </div>
      ) : null}
      <SectionCard>
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:items-end">
          <div className="grid min-w-0 gap-1">
            <Label>{t('attendance.from')}</Label>
            <DateField value={dateFrom} onChange={setDateFrom} />
          </div>
          <div className="grid min-w-0 gap-1">
            <Label>{t('attendance.to')}</Label>
            <DateField value={dateTo} onChange={setDateTo} />
          </div>
          <div className="grid min-w-0 gap-1">
            <Label>{t('attendance.branch')}</Label>
            <Select value={branchId || '__all'} onValueChange={(v) => setBranchId(v === '__all' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t('attendance.all')}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1">
            <Label>{t('attendance.employee')}</Label>
            <Select value={employeeId || '__all'} onValueChange={(v) => setEmployeeId(v === '__all' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t('attendance.all')}</SelectItem>
                {emps.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.user_full_name ?? e.user_email ?? `#${e.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1">
            <Label>{t('attendance.filter_category')}</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_FILTERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === '__all' ? t('attendance.all') : t(`attendance.category.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1">
            <Label>{t('attendance.filter_status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === '__all' ? t('attendance.all') : t(`attendance.status.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>
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
