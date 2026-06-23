import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, UserPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingOnboarding } from '@/features/admin/queries';
import type { LeaveRequestRead } from '@/features/hr/api';
import { leaveListQueryOptions } from '@/features/hr/queries';
import { payrollPeriodQueryOptions } from '@/features/payroll/queries';
import { useNavBadges } from '@/hooks/useNavBadges';
import { usePermission } from '@/hooks/usePermission';
import { now } from '@/lib/date';
import { cn } from '@/lib/utils';

import { RoleDashboardShell } from './RoleDashboardShell';

function HrKpiCard({
  to,
  navigable,
  children,
}: {
  to: string;
  navigable: boolean;
  children: ReactNode;
}) {
  const body = (
    <Card
      className={cn(
        'h-full border-border/80 transition-colors duration-150',
        navigable &&
          'group-hover:border-muted-foreground/25 group-hover:bg-muted/45 group-hover:shadow-sm dark:group-hover:bg-muted/25',
      )}
    >
      {children}
    </Card>
  );

  if (!navigable) {
    return <div className="h-full opacity-75">{body}</div>;
  }

  return (
    <Link
      to={to}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {body}
    </Link>
  );
}

function defaultYearMonth(): { year: number; month: number } {
  const d = now();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function PendingLeaveRow({ row }: { row: LeaveRequestRead }) {
  const { t: tHr } = useTranslation('hr');
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-3 transition-colors hover:bg-muted/30">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary/15 text-secondary">
        <CalendarClock className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">
          {tHr('leave.type.' + row.leave_type, { defaultValue: row.leave_type })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground num-latin">
          #{row.id} · {row.start_date} → {row.end_date}
        </p>
      </div>
      <Badge variant="outline" className="shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-400">
        {tHr('leave.st.' + row.status, { defaultValue: row.status })}
      </Badge>
    </li>
  );
}

function PendingOnboardingRow({
  id,
  name,
  email,
  jobTitle,
}: {
  id: number;
  name: string;
  email: string | null;
  jobTitle: string | null;
}) {
  const { t: tHr } = useTranslation('hr');
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-3 transition-colors hover:bg-muted/30">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary/15 text-secondary">
        <UserPlus className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{name}</p>
        <p className="mt-1 text-xs text-muted-foreground num-latin">{email ?? '—'}</p>
        {jobTitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{jobTitle}</p>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2" asChild>
        <Link to={`/hr/employees/pending/${id}`}>
          {tHr('pending.review')}
          <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
        </Link>
      </Button>
    </li>
  );
}

export default function HrManagerDashboard() {
  const { t } = useTranslation('bi');
  const badges = useNavBadges();
  const canEmployees = usePermission('employees', 'read');
  const canOnboarding = usePermission('onboarding', 'read');
  const canPayroll = usePermission('payroll', 'read');

  const [{ year, month }] = useState(defaultYearMonth);

  const pendingLeave = useQuery({
    ...leaveListQueryOptions({ status: 'pending', limit: 50 }),
    enabled: canEmployees,
  });

  const onboarding = usePendingOnboarding({ enabled: canOnboarding });

  const payroll = useQuery({
    ...payrollPeriodQueryOptions(year, month),
    enabled: canPayroll,
  });

  const recentLeaves = (pendingLeave.data ?? []).slice(0, 6);
  const pendingRecruitmentRows = (onboarding.data ?? []).slice(0, 6);

  return (
    <RoleDashboardShell title={t('role.hr.title')} subtitle={t('role.hr.subtitle')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HrKpiCard to="/hr/leave" navigable={canEmployees}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.hr.pending_leave')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums num-latin">{badges.leave_pending}</p>
          </CardContent>
        </HrKpiCard>
        <HrKpiCard to="/hr/employees/pending" navigable={canOnboarding}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.hr.pending_onboarding')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums num-latin">{badges.onboarding_pending}</p>
          </CardContent>
        </HrKpiCard>
        <HrKpiCard to="/payroll/overview" navigable={canPayroll}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.hr.payroll')}</CardTitle>
            <CardDescription className="num-latin">
              {year}-{String(month).padStart(2, '0')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canPayroll ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : payroll.isLoading ? (
              <p>…</p>
            ) : payroll.data?.summary ? (
              <ul className="space-y-1 text-sm num-latin">
                <li>
                  {t('role.hr.payroll_draft')}: {payroll.data.summary.payslips_draft}
                </li>
                <li>
                  {t('role.hr.payroll_paid')}: {payroll.data.summary.payslips_paid}
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('role.empty')}</p>
            )}
          </CardContent>
        </HrKpiCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/80">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t('role.hr.recent_leave')}</CardTitle>
              <CardDescription>{t('role.hr.recent_leave_hint')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/hr/leave">{t('role.view_all')}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!canEmployees ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : pendingLeave.isLoading ? (
              <p>…</p>
            ) : recentLeaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('role.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {recentLeaves.map((row) => (
                  <PendingLeaveRow key={row.id} row={row} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t('role.hr.pending_recruitments_table_title')}</CardTitle>
              <CardDescription>{t('role.hr.pending_recruitments_table_hint')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/hr/employees/pending">{t('role.view_all')}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!canOnboarding ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : onboarding.isLoading ? (
              <p>…</p>
            ) : pendingRecruitmentRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('role.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {pendingRecruitmentRows.map((row) => (
                  <PendingOnboardingRow
                    key={row.id}
                    id={row.id}
                    name={row.user_full_name ?? row.user_email ?? `#${row.user_id}`}
                    email={row.user_email ?? null}
                    jobTitle={row.job_title ?? null}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleDashboardShell>
  );
}
