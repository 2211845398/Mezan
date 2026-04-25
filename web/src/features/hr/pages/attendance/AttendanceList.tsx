import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DateField } from '@/components/shared/form/DateField';
import { DataTable, defineColumns } from '@/components/shared/DataTable';
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
import { adminKeys } from '@/features/admin/queries';

import type { AttendanceLogRead } from '../../api';
import { employeesQueryOptions, attendanceListQueryOptions } from '../../queries';

export default function AttendanceList() {
  const { t } = useTranslation('hr');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: emps = [] } = useQuery(employeesQueryOptions());

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
          cell: ({ row }) => row.original.employee_profile_id,
        },
        { id: 'branch', accessorKey: 'branch_id', header: t('attendance.col.branch') },
        {
          id: 'in',
          header: t('attendance.col.in'),
          cell: ({ row }) => row.original.clock_in_at?.slice(0, 19) ?? '—',
        },
        {
          id: 'out',
          header: t('attendance.col.out'),
          cell: ({ row }) => row.original.clock_out_at?.slice(0, 19) ?? '—',
        },
        {
          id: 'open',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="sm" variant="link" asChild>
              <Link to={`/hr/attendance/timesheet/${row.original.employee_profile_id}`}>
                {t('attendance.timesheet_link')}
              </Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('attendance.title')}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('attendance.from')}</Label>
          <DateField value={dateFrom} onChange={setDateFrom} />
        </div>
        <div className="grid gap-1">
          <Label>{t('attendance.to')}</Label>
          <DateField value={dateTo} onChange={setDateTo} />
        </div>
        <div className="grid gap-1">
          <Label>{t('attendance.branch')}</Label>
          <Select value={branchId || '__all'} onValueChange={(v) => setBranchId(v === '__all' ? '' : v)}>
            <SelectTrigger className="w-[180px]">
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
        <div className="grid gap-1">
          <Label>{t('attendance.employee')}</Label>
          <Select value={employeeId || '__all'} onValueChange={(v) => setEmployeeId(v === '__all' ? '' : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('attendance.all')}</SelectItem>
              {emps.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  #{e.id} (user {e.user_id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
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
