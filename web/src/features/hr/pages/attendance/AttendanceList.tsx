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
import { attendanceListQueryOptions, employeesQueryOptions } from '../../queries';

export default function AttendanceList() {
  const { t } = useTranslation('hr');
  const [dateFrom, setDateFrom] = useState(() => utcCalendarDayKey(subDays(now(), 7)));
  const [dateTo, setDateTo] = useState(() => utcCalendarDayKey(now()));
  const [branchId, setBranchId] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: emps = [] } = useQuery(employeesQueryOptions());

  const employeeById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);

  const q = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(employeeId ? { employee_profile_id: Number(employeeId) } : {}),
    }),
    [dateFrom, dateTo, branchId, employeeId],
  );

  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    attendanceListQueryOptions(q),
  );

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
            return attendanceLogRowSearchValue(row, {
              employeeText: [label, String(row.employee_profile_id), ep?.user_email].filter(Boolean).join(' '),
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('attendance.title')} />
      <SectionCard>
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))] lg:items-end">
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
