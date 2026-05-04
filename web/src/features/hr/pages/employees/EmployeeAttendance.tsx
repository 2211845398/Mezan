import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { format, formatIso, hoursBetween, now } from '@/lib/date';

import type { AttendanceLogRead } from '../../api';
import { attendanceListQueryOptions } from '../../queries';

export default function EmployeeAttendance() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const { t } = useTranslation('hr');

  const [dateFrom, setDateFrom] = useState(() => format(subDays(now(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(now(), 'yyyy-MM-dd'));

  const { data: attendance = [], isLoading } = useQuery({
    ...attendanceListQueryOptions({
      date_from: dateFrom,
      date_to: dateTo,
      employee_profile_id: employeeId,
    }),
    enabled: !Number.isNaN(employeeId),
  });

  const columns = useMemo(
    () =>
      defineColumns<AttendanceLogRead>()([
        {
          id: 'date',
          header: t('attendance.col.date'),
          cell: ({ row }) =>
            row.original.clock_in_at ? formatIso(row.original.clock_in_at, 'yyyy-MM-dd') : '—',
        },
        {
          id: 'branch',
          header: t('attendance.col.branch'),
          cell: ({ row }) => `Branch #${row.original.branch_id}`,
        },
        {
          id: 'in',
          header: t('attendance.col.in'),
          cell: ({ row }) =>
            row.original.clock_in_at ? formatIso(row.original.clock_in_at, 'HH:mm') : '—',
        },
        {
          id: 'out',
          header: t('attendance.col.out'),
          cell: ({ row }) =>
            row.original.clock_out_at
              ? formatIso(row.original.clock_out_at, 'HH:mm')
              : <span className="text-yellow-600">{t('attendance.open')}</span>,
        },
        {
          id: 'duration',
          header: t('attendance.col.duration'),
          cell: ({ row }) => {
            if (!row.original.clock_in_at || !row.original.clock_out_at) return '—';
            const hours = hoursBetween(row.original.clock_in_at, row.original.clock_out_at);
            return `${Math.round(hours * 10) / 10}h`;
          },
        },
      ]),
    [t],
  );

  // Calculate summary stats
  const stats = useMemo(() => {
    const total = attendance.length;
    const completed = attendance.filter(a => a.clock_out_at != null).length;
    const open = total - completed;
    let totalHours = 0;
    attendance.forEach(a => {
      if (a.clock_in_at && a.clock_out_at) {
        totalHours += hoursBetween(a.clock_in_at, a.clock_out_at);
      }
    });
    return { total, completed, open, totalHours: Math.round(totalHours * 10) / 10 };
  }, [attendance]);

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>{t('attendance.from')}</Label>
            <DateField value={dateFrom} onChange={setDateFrom} />
          </div>
          <div className="space-y-1">
            <Label>{t('attendance.to')}</Label>
            <DateField value={dateTo} onChange={setDateTo} />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDateFrom(format(subDays(now(), 7), 'yyyy-MM-dd'));
              setDateTo(format(now(), 'yyyy-MM-dd'));
            }}
          >
            {t('attendance.last_7_days')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDateFrom(format(subDays(now(), 30), 'yyyy-MM-dd'));
              setDateTo(format(now(), 'yyyy-MM-dd'));
            }}
          >
            {t('attendance.last_30_days')}
          </Button>
        </div>
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('attendance.total_records')}</p>
          <p className="text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('attendance.completed')}</p>
          <p className="text-2xl font-semibold text-green-600">{stats.completed}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('attendance.open')}</p>
          <p className="text-2xl font-semibold text-yellow-600">{stats.open}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('attendance.total_hours')}</p>
          <p className="text-2xl font-semibold">{stats.totalHours}h</p>
        </div>
      </div>

      <DataTable
        mode="client"
        columns={columns}
        data={attendance}
        isLoading={isLoading}
        emptyState={<p className="text-sm text-muted-foreground">{t('attendance.empty')}</p>}
      />
    </div>
  );
}
