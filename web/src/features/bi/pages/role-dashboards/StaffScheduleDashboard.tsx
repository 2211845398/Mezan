import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { scheduleWeekdayLabel } from '@/features/hr/lib/hrTableSearch';
import { mySchedulesQueryOptions } from '@/features/hr/queries';
import { useCurrentShift } from '@/features/pos/queries';
import { usePosTerminalStore } from '@/features/pos/stores/posTerminalStore';
import { usePermission } from '@/hooks/usePermission';

import { RoleDashboardShell } from './RoleDashboardShell';

export default function StaffScheduleDashboard() {
  const { t } = useTranslation('bi');
  const { t: tHr } = useTranslation('hr');
  const branchId = useAuthStore((s) => s.activeBranchId);
  const terminalId = usePosTerminalStore((s) => s.activeTerminalId);
  const canPosShift = usePermission('pos_shifts', 'read');

  const schedules = useQuery({
    ...mySchedulesQueryOptions({ enabled: true }),
  });

  const shift = useCurrentShift(canPosShift ? terminalId : null);

  const rows = useMemo(
    () => [...(schedules.data ?? [])].sort((a, b) => a.weekday - b.weekday),
    [schedules.data],
  );

  return (
    <RoleDashboardShell title={t('role.staff.title')} subtitle={t('role.staff.subtitle')}>
      {branchId != null ? (
        <p className="text-sm text-muted-foreground num-latin">
          {t('role.staff.branch', { id: branchId })}
        </p>
      ) : null}

      {canPosShift ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.staff.current_shift')}</CardTitle>
            <CardDescription className="num-latin">
              {terminalId != null
                ? t('role.staff.terminal', { id: terminalId })
                : t('role.staff.no_terminal')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {shift.isLoading ? (
              <p>…</p>
            ) : shift.data?.id ? (
              <p className="text-sm num-latin">
                {t('role.staff.shift_open', { id: shift.data.id })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('role.staff.shift_closed')}</p>
            )}
            <Button className="mt-3" size="sm" asChild>
              <Link to="/pos">{t('role.staff.open_pos')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('role.staff.weekly_schedule')}</CardTitle>
          <CardDescription>{t('role.staff.weekly_schedule_hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          {schedules.isLoading ? (
            <p>…</p>
          ) : schedules.isError ? (
            <p className="text-sm text-destructive">{t('role.load_error')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('role.staff.no_schedule')}</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>{scheduleWeekdayLabel(row.weekday, tHr)}</span>
                  <span className="text-muted-foreground num-latin">
                    {row.is_day_off
                      ? tHr('employees.form.day_off')
                      : `${row.start_time.slice(0, 5)} – ${row.end_time.slice(0, 5)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </RoleDashboardShell>
  );
}
