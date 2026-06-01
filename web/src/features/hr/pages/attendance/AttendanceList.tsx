import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { paginatedParams } from '@/api/pagination';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import { DateField } from '@/components/shared/form/DateField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { listBranches } from '@/features/admin/api';
import { getBranchLabel } from '@/features/admin/lib/branchLabels';
import { adminKeys } from '@/features/admin/queries';
import { formatIso, now, utcCalendarDayKey } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { notify } from '@/lib/toast';

import type { AttendanceLogRead } from '../../api';
import { EmployeeCombobox } from '../../components/EmployeeCombobox';
import {
  attendanceCategoryLabel,
  attendanceLabelsSearchBlob,
  attendanceStatusLabel,
} from '../../lib/attendanceLabels';
import { isAttendanceWideRangeBlocked } from '../../lib/attendanceQueryGuard';
import { attendanceLogRowSearchValue } from '../../lib/hrTableSearch';
import { attendanceListQueryOptions, attendanceSummaryQueryOptions } from '../../queries';

const DISPLAY_CURRENCY = 'USD';

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

function employeeDisplayLabel(row: AttendanceLogRead): string {
  return (
    row.employee_user_full_name ??
    row.employee_user_email ??
    `#${row.employee_profile_id}`
  );
}

function formatOvertimeMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  return String(minutes);
}

function formatPayrollImpact(amount: string | null | undefined): string {
  if (amount == null || amount === '') return '—';
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return formatCurrency(0, DISPLAY_CURRENCY);
  const formatted = formatCurrency(Math.abs(n), DISPLAY_CURRENCY);
  if (n > 0) return `+${formatted}`;
  return `-${formatted}`;
}

export default function AttendanceList() {
  const { t, i18n } = useTranslation('hr');
  const today = utcCalendarDayKey(now());
  const [dateFrom, setDateFrom] = useState(() => today);
  const [dateTo, setDateTo] = useState(() => today);
  const [branchId, setBranchId] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('__all');
  const [statusFilter, setStatusFilter] = useState<string>('__all');

  const [urlQuery, urlActions] = useTableUrlState({ pageSize: 10 });
  const { limit, offset } = paginatedParams(urlQuery.page, urlQuery.pageSize);

  const filterSignature = `${dateFrom}|${dateTo}|${branchId}|${employeeId}|${categoryFilter}|${statusFilter}`;
  useEffect(() => {
    urlActions.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset pagination when filters change only
  }, [filterSignature]);

  const wideRangeBlocked = isAttendanceWideRangeBlocked(
    dateFrom,
    dateTo,
    branchId,
    employeeId,
  );

  const wasWideRangeBlocked = useRef(false);
  useEffect(() => {
    if (wideRangeBlocked && !wasWideRangeBlocked.current) {
      notify.warning(t('attendance.validation.wide_range'), { id: 'attendance-wide-range' });
    }
    wasWideRangeBlocked.current = wideRangeBlocked;
  }, [wideRangeBlocked, t]);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const listFilters = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(employeeId ? { employee_profile_id: Number(employeeId) } : {}),
      ...(categoryFilter !== '__all' ? { attendance_category: categoryFilter } : {}),
      ...(statusFilter !== '__all' ? { classification_status: statusFilter } : {}),
      limit,
      offset,
    }),
    [dateFrom, dateTo, branchId, employeeId, categoryFilter, statusFilter, limit, offset],
  );

  const {
    data: listData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...attendanceListQueryOptions(listFilters),
    enabled: !wideRangeBlocked,
  });

  const rows = listData?.items ?? [];
  const totalRows = listData?.total ?? 0;

  const summaryParams = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(employeeId ? { employee_profile_id: Number(employeeId) } : {}),
    }),
    [dateFrom, dateTo, branchId, employeeId],
  );

  const { data: summary } = useQuery({
    ...attendanceSummaryQueryOptions(summaryParams),
    enabled: !wideRangeBlocked,
  });

  const columns = useMemo(() => {
    const tHrAr = i18n.getFixedT('ar', 'hr');
    const tHrEn = i18n.getFixedT('en', 'hr');
    return defineColumns<AttendanceLogRead>()([
      {
        id: 'employee',
        header: t('attendance.col.employee'),
        accessorFn: (row) => {
          const label = employeeDisplayLabel(row);
          const branchText = getBranchLabel(branches, row.branch_id);
          const inText = row.clock_in_at ? formatIso(row.clock_in_at, 'yyyy-MM-dd HH:mm') : '';
          const outText = row.clock_out_at ? formatIso(row.clock_out_at, 'yyyy-MM-dd HH:mm') : '';
          const openText = row.clock_out_at ? '' : t('attendance.open');
          const labelBlob = attendanceLabelsSearchBlob(
            t,
            tHrAr,
            tHrEn,
            row.attendance_category,
            row.classification_status,
          );
          return attendanceLogRowSearchValue(row, {
            employeeText: [label, String(row.employee_profile_id), row.employee_user_email, labelBlob]
              .filter(Boolean)
              .join(' '),
            branchText,
            inText,
            outText,
            openText,
          });
        },
        cell: ({ row }) => employeeDisplayLabel(row.original),
      },
      {
        id: 'category',
        header: t('attendance.col.category'),
        accessorFn: (row) =>
          attendanceLabelsSearchBlob(t, tHrAr, tHrEn, row.attendance_category, null),
        cell: ({ row }) => attendanceCategoryLabel(t, row.original.attendance_category),
      },
      {
        id: 'status',
        header: t('attendance.col.status'),
        accessorFn: (row) =>
          attendanceLabelsSearchBlob(t, tHrAr, tHrEn, null, row.classification_status),
        cell: ({ row }) => attendanceStatusLabel(t, row.original.classification_status),
      },
      {
        id: 'branch',
        header: t('attendance.col.branch'),
        accessorFn: (row) => {
          const label = employeeDisplayLabel(row);
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
          const label = employeeDisplayLabel(row);
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
          const label = employeeDisplayLabel(row);
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
        cell: ({ row }) => formatOvertimeMinutes(row.original.overtime_minutes),
      },
      {
        id: 'impact',
        header: t('attendance.col.payroll_impact'),
        accessorFn: (row) => String(row.payroll_impact_amount ?? ''),
        cell: ({ row }) => formatPayrollImpact(row.original.payroll_impact_amount),
      },
    ]);
  }, [branches, i18n, t]);

  const presentCount = summary?.by_status?.present ?? 0;
  const lateCount = summary?.by_status?.late ?? 0;
  const absentDays = summary?.absent_days ?? 0;
  const otMin = summary?.overtime_minutes_total ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('attendance.title')} />
      {summary && !wideRangeBlocked ? (
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
            <BranchCombobox
              label={t('attendance.branch')}
              value={branchId ? Number(branchId) : null}
              onChange={(id) => setBranchId(id == null ? '' : String(id))}
              allowClear
              clearLabel={t('attendance.all')}
              includeArchived={false}
            />
          </div>
          <div className="grid min-w-0 gap-1">
            <Label>{t('attendance.employee')}</Label>
            <EmployeeCombobox value={employeeId} onChange={setEmployeeId} allowAll />
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
        mode="server"
        defaultUrlQuery={{ pageSize: 10 }}
        columns={columns}
        data={rows}
        totalRows={totalRows}
        isLoading={!wideRangeBlocked && isLoading}
        isError={!wideRangeBlocked && isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
