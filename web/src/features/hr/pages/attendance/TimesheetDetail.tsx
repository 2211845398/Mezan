import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { totalHoursFromLogs } from '@/lib/timesheet';

import { employeeQueryOptions, timesheetQueryOptions } from '../../queries';

export default function TimesheetDetail() {
  const { employeeProfileId } = useParams<{ employeeProfileId: string }>();
  const eid = employeeProfileId ? Number(employeeProfileId) : NaN;
  const { t } = useTranslation('hr');

  const { data: profile } = useQuery({ ...employeeQueryOptions(eid), enabled: !Number.isNaN(eid) });
  const { data: logs = [], isLoading } = useQuery({
    ...timesheetQueryOptions(eid),
    enabled: !Number.isNaN(eid),
  });

  const total = totalHoursFromLogs(logs);

  if (Number.isNaN(eid)) return null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {t('timesheet.title')} #{eid}
          {profile ? ` — user ${profile.user_id}` : ''}
        </h1>
        <ButtonLink />
      </div>
      <p className="text-sm text-muted-foreground">
        {t('timesheet.hours_total')}: {total}
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('attendance.col.in')}</TableHead>
              <TableHead>{t('attendance.col.out')}</TableHead>
              <TableHead>{t('timesheet.hours')}</TableHead>
              <TableHead>{t('attendance.col.branch')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((ln) => (
              <TableRow key={ln.id}>
                <TableCell>{ln.clock_in_at?.slice(0, 19)}</TableCell>
                <TableCell>{ln.clock_out_at?.slice(0, 19) ?? '—'}</TableCell>
                <TableCell>
                  {ln.clock_out_at
                    ? totalHoursFromLogs([{ clock_in_at: ln.clock_in_at, clock_out_at: ln.clock_out_at }])
                    : '—'}
                </TableCell>
                <TableCell>{ln.branch_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ButtonLink() {
  const { t } = useTranslation('hr');
  return (
    <Link className="text-sm underline" to="/hr/attendance">
      {t('attendance.title')}
    </Link>
  );
}
