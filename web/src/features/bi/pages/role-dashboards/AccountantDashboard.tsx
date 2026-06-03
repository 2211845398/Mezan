import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  apOpenItemsQueryOptions,
  arOpenItemsQueryOptions,
  incomeStatementQueryOptions,
  trialBalanceQueryOptions,
} from '@/features/accounting/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { format, now } from '@/lib/date';
import { formatCurrency } from '@/lib/format';

import { RoleDashboardShell } from './RoleDashboardShell';

const DISPLAY_CURRENCY = 'USD';

function num(s: string | undefined | null): number {
  if (s == null || s === '') return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export default function AccountantDashboard() {
  const { t } = useTranslation('bi');
  const branchId = useAuthStore((s) => s.activeBranchId);
  const canAccounting = usePermission('accounting', 'read');

  const periodEnd = useMemo(() => format(now(), 'yyyy-MM-dd'), []);
  const periodStart = useMemo(() => format(subDays(now(), 30), 'yyyy-MM-dd'), []);

  const income = useQuery({
    ...incomeStatementQueryOptions({
      period_start: periodStart,
      period_end: periodEnd,
      ...(branchId != null ? { branch_id: branchId } : {}),
    }),
    enabled: canAccounting,
  });

  const tb = useQuery({
    ...trialBalanceQueryOptions({
      as_of: periodEnd,
      ...(branchId != null ? { branch_id: branchId } : {}),
    }),
    enabled: canAccounting,
  });

  const ar = useQuery({
    ...arOpenItemsQueryOptions({
      ...(branchId != null ? { branch_id: branchId } : {}),
    }),
    enabled: canAccounting,
  });

  const ap = useQuery({
    ...apOpenItemsQueryOptions({
      ...(branchId != null ? { branch_id: branchId } : {}),
    }),
    enabled: canAccounting,
  });

  const tbBalanced = useMemo(() => {
    const rows = tb.data ?? [];
    let debit = 0;
    let credit = 0;
    for (const r of rows) {
      debit += num(r.total_debit);
      credit += num(r.total_credit);
    }
    if (rows.length === 0) return null;
    return Math.abs(debit - credit) < 0.0001;
  }, [tb.data]);

  if (!canAccounting) {
    return <RoleDashboardShell title={t('role.accountant.title')} subtitle={t('role.accountant.no_permission')} />;
  }

  const rev = income.data ? num(income.data.total_revenue) : 0;
  const exp = income.data ? num(income.data.total_expense) : 0;
  const net = income.data ? num(income.data.net_income) : 0;

  return (
    <RoleDashboardShell
      title={t('role.accountant.title')}
      subtitle={t('role.accountant.subtitle', { from: periodStart, to: periodEnd })}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.accountant.kpi_revenue')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums num-latin">
              {income.isLoading ? '…' : formatCurrency(rev, DISPLAY_CURRENCY)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.accountant.kpi_expense')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums num-latin">
              {income.isLoading ? '…' : formatCurrency(exp, DISPLAY_CURRENCY)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.accountant.kpi_net')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums num-latin">
              {income.isLoading ? '…' : formatCurrency(net, DISPLAY_CURRENCY)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('role.accountant.kpi_tb')}</CardTitle>
            <CardDescription>{t('role.accountant.kpi_tb_hint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {tb.isLoading ? (
              <p className="text-2xl">…</p>
            ) : tbBalanced == null ? (
              <p className="text-sm text-muted-foreground">{t('role.empty')}</p>
            ) : (
              <p className="text-2xl font-semibold">{tbBalanced ? t('role.accountant.balanced') : t('role.accountant.unbalanced')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.accountant.ar_title')}</CardTitle>
            <CardDescription>{t('role.accountant.open_items_hint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums num-latin">{ar.isLoading ? '…' : (ar.data?.length ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.accountant.ap_title')}</CardTitle>
            <CardDescription>{t('role.accountant.open_items_hint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums num-latin">{ap.isLoading ? '…' : (ap.data?.length ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {(income.isError || tb.isError) && <p className="text-sm text-destructive">{t('role.load_error')}</p>}
    </RoleDashboardShell>
  );
}
