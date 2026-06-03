import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/features/auth/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import EmployeeLeaveRequestDialog from '@/features/hr/pages/employees/EmployeeLeaveRequestDialog';
import { scheduleWeekdayLabel } from '@/features/hr/lib/hrTableSearch';
import { mySchedulesQueryOptions } from '@/features/hr/queries';
import { getShiftCashEvents } from '@/features/pos/api';
import { useCurrentShift, useTerminalsForBranch } from '@/features/pos/queries';
import { usePosTerminalStore } from '@/features/pos/stores/posTerminalStore';
import { usePermission } from '@/hooks/usePermission';
import { formatMoney } from '@/lib/format';
import { formatIso } from '@/lib/date';
import { cn } from '@/lib/utils';

import { RoleDashboardShell } from './RoleDashboardShell';

function weekdayIndexFromDate(d: Date): number {
  return d.getDay();
}

function ContextChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full truncate rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm text-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

export default function StaffScheduleDashboard() {
  const { t } = useTranslation('bi');
  const { t: tCommon } = useTranslation('common');
  const { t: tHr } = useTranslation('hr');
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const { data: me } = useMe();
  const canRequestLeave = me?.employee_profile_id != null && me.employee_profile_id > 0;
  const branchId = useAuthStore((s) => s.activeBranchId ?? s.user?.branch_id ?? null);
  const terminalId = usePosTerminalStore((s) => s.activeTerminalId);
  const canPosShift = usePermission('pos_shifts', 'read');
  const canNotifications = usePermission('notifications', 'read');

  const { data: terminals = [] } = useTerminalsForBranch(branchId);
  const activeTerminal = useMemo(
    () => (terminalId != null ? terminals.find((term) => term.id === terminalId) : undefined),
    [terminals, terminalId],
  );
  const terminalLabel = activeTerminal?.name?.trim() ?? null;

  const schedules = useQuery({
    ...mySchedulesQueryOptions({ enabled: true }),
  });

  const shift = useCurrentShift(canPosShift ? terminalId : null);

  const cashEvents = useQuery({
    queryKey: ['pos', 'shifts', shift.data?.id, 'cash-events'],
    queryFn: () => getShiftCashEvents(shift.data!.id, 15),
    enabled: canPosShift && shift.data?.id != null,
    staleTime: 15_000,
  });

  const todayWeekday = weekdayIndexFromDate(new Date());

  const rows = useMemo(
    () => [...(schedules.data ?? [])].sort((a, b) => a.weekday - b.weekday),
    [schedules.data],
  );

  const todayRow = rows.find((r) => r.weekday === todayWeekday);
  const nextWorkDay = useMemo(() => {
    for (let offset = 1; offset <= 7; offset += 1) {
      const wd = (todayWeekday + offset) % 7;
      const row = rows.find((r) => r.weekday === wd);
      if (row && !row.is_day_off) return row;
    }
    return null;
  }, [rows, todayWeekday]);

  return (
    <RoleDashboardShell title={t('role.staff.title')}>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link to="/pos">{t('role.staff.open_pos')}</Link>
        </Button>
        {canNotifications ? (
          <Button size="sm" variant="outline" asChild>
            <Link to="/notifications">{t('role.staff.shortcut_notifications')}</Link>
          </Button>
        ) : null}
        {canRequestLeave ? (
          <Button size="sm" variant="outline" type="button" onClick={() => setLeaveDialogOpen(true)}>
            {tCommon('layout.leave_request')}
          </Button>
        ) : null}
      </div>

      {canRequestLeave && me?.employee_profile_id ? (
        <EmployeeLeaveRequestDialog
          employeeProfileId={me.employee_profile_id}
          open={leaveDialogOpen}
          onOpenChange={setLeaveDialogOpen}
          selfService
        />
      ) : null}

      {canPosShift ? (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">{t('role.staff.current_shift')}</CardTitle>
            {terminalId != null && terminalLabel ? (
              <ContextChip>{terminalLabel}</ContextChip>
            ) : (
              <p className="text-sm text-muted-foreground">{t('role.staff.no_terminal')}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {shift.isLoading ? (
              <p>…</p>
            ) : shift.data?.id ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t('role.staff.opened_at')}</dt>
                  <dd className="num-latin">{formatIso(shift.data.opened_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('role.staff.opening_float')}</dt>
                  <dd className="num-latin">{formatMoney(shift.data.opening_float)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('role.staff.expected_cash')}</dt>
                  <dd className="num-latin">{formatMoney(shift.data.expected_cash)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('role.staff.transactions')}</dt>
                  <dd className="num-latin">{shift.data.transactions_in_shift ?? 0}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t('role.staff.shift_closed')}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {canPosShift && shift.data?.id ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.staff.terminal_log')}</CardTitle>
          </CardHeader>
          <CardContent>
            {cashEvents.isLoading ? (
              <p>…</p>
            ) : cashEvents.isError ? (
              <p className="text-sm text-destructive">{t('role.load_error')}</p>
            ) : (cashEvents.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t('role.staff.terminal_log_empty')}</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {cashEvents.data!.items.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span>
                      {t(`role.staff.event_${ev.event_type}`, { defaultValue: ev.event_type })}
                    </span>
                    <span className="text-muted-foreground num-latin">
                      {formatMoney(ev.amount)} · {formatIso(ev.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {(todayRow || nextWorkDay) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.staff.upcoming')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {todayRow ? (
              <p>
                <span className="font-medium">{t('role.staff.today')}:</span>{' '}
                {todayRow.is_day_off
                  ? tHr('employees.form.day_off')
                  : `${todayRow.start_time.slice(0, 5)} – ${todayRow.end_time.slice(0, 5)}`}
              </p>
            ) : null}
            {nextWorkDay ? (
              <p>
                <span className="font-medium">{t('role.staff.next_shift')}:</span>{' '}
                {scheduleWeekdayLabel(nextWorkDay.weekday, tHr)}{' '}
                {nextWorkDay.start_time.slice(0, 5)} – {nextWorkDay.end_time.slice(0, 5)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('role.staff.weekly_schedule')}</CardTitle>
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
                <li
                  key={row.id}
                  className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${
                    row.weekday === todayWeekday ? 'bg-muted/50' : ''
                  }`}
                >
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
