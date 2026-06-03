import { useQuery } from '@tanstack/react-query';
import { type ReactNode,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePendingOnboarding } from '@/features/admin/queries';
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

export default function HrManagerDashboard() {
  const { t } = useTranslation('bi');
  const { t: tHr } = useTranslation('hr');
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
  const pendingRecruitmentRows = (onboarding.data ?? []).slice(0, 10);

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

      <Card>
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
            <ul className="divide-y rounded-md border text-sm">
              {recentLeaves.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="num-latin">
                    #{row.id} · {row.start_date} → {row.end_date}
                  </span>
                  <span className="text-muted-foreground">{row.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 num-latin">{t('role.hr.table_col_id')}</TableHead>
                  <TableHead>{t('role.hr.table_col_name')}</TableHead>
                  <TableHead>{t('role.hr.table_col_email')}</TableHead>
                  <TableHead>{t('role.hr.table_col_job')}</TableHead>
                  <TableHead>{t('role.hr.table_col_role')}</TableHead>
                  <TableHead>{t('role.hr.table_col_status')}</TableHead>
                  <TableHead className="w-28 text-end">{t('role.hr.table_col_action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRecruitmentRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs num-latin">{row.id}</TableCell>
                    <TableCell className="font-medium">
                      {row.user_full_name ?? row.user_email ?? `#${row.user_id}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground num-latin">{row.user_email ?? '—'}</TableCell>
                    <TableCell>{row.job_title ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{row.user_role_name ?? row.user_role_code ?? '—'}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell className="text-end">
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <Link to={`/hr/employees/pending/${row.id}`}>{tHr('pending.review')}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </RoleDashboardShell>
  );
}
