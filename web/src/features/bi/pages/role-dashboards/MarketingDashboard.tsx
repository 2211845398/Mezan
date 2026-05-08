import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { executiveKpisQueryOptions } from '@/features/bi/queries';
import {
  inventoryAlertsQueryOptions,
  promotionPerformanceQueryOptions,
  topSellingQueryOptions,
} from '@/features/marketing/queries';
import { usePermission } from '@/hooks/usePermission';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatCompactCurrency, formatCurrency } from '@/lib/format';

import { RoleDashboardShell } from './RoleDashboardShell';

const DISPLAY_CURRENCY = 'USD';

function num(s: string | undefined | null): number {
  if (s == null || s === '') return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export default function MarketingDashboard() {
  const { t } = useTranslation('bi');
  const branchId = useAuthStore((s) => s.activeBranchId);
  const canAnalytics = usePermission('analytics', 'read');

  const [ps, setPs] = useState(() => utcCalendarDayKey(subDays(now(), 30)));
  const [pe, setPe] = useState(() => utcCalendarDayKey(now()));
  const [applied, setApplied] = useState({ ps, pe });

  const qKpi = useMemo(() => {
    const args: { period_start?: string; period_end?: string; branch_id?: number } = {
      period_start: applied.ps,
      period_end: applied.pe,
    };
    if (branchId != null) args.branch_id = branchId;
    return args;
  }, [applied.ps, applied.pe, branchId]);

  const kpis = useQuery({
    ...executiveKpisQueryOptions(qKpi),
    enabled: canAnalytics,
  });

  const top = useQuery(
    topSellingQueryOptions({
      limit: 8,
      period_start: `${applied.ps}T00:00:00Z`,
      period_end: `${applied.pe}T23:59:59Z`,
    }),
  );

  const promos = useQuery(promotionPerformanceQueryOptions(8));
  const alerts = useQuery(inventoryAlertsQueryOptions(30));

  const topRows = top.data?.items?.slice(0, 5) ?? [];
  const promoRows = promos.data?.items?.slice(0, 5) ?? [];

  return (
    <RoleDashboardShell title={t('role.marketing.title')} subtitle={t('role.marketing.subtitle')}>
      {canAnalytics ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('filters.title')}</CardTitle>
            <CardDescription>{t('role.marketing.period_hint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1">
              <Label>{t('filters.period_start')}</Label>
              <DateField value={ps} onChange={setPs} />
            </div>
            <div className="grid gap-1">
              <Label>{t('filters.period_end')}</Label>
              <DateField value={pe} onChange={setPe} />
            </div>
            <Button type="button" onClick={() => setApplied({ ps, pe })}>
              {t('filters.apply')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canAnalytics && kpis.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t('kpi.revenue')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums num-latin">
                {formatCompactCurrency(num(kpis.data.gross_sales as unknown as string), DISPLAY_CURRENCY)}
              </p>
              <p className="text-xs text-muted-foreground num-latin">
                {formatCurrency(num(kpis.data.gross_sales as unknown as string), DISPLAY_CURRENCY)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t('kpi.orders')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums num-latin">{kpis.data.invoice_count ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t('charts.category_mix')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums num-latin">{kpis.data.category_mix?.length ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t('tables.top_products_title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums num-latin">{kpis.data.top_products?.length ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.marketing.top_products')}</CardTitle>
            <CardDescription>{t('role.marketing.top_products_hint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {top.isLoading ? (
              <p className="text-sm text-muted-foreground">…</p>
            ) : topRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('role.empty')}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {topRows.map((row) => (
                  <li key={row.product_id} className="flex justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="min-w-0 truncate">{row.product_name}</span>
                    <span className="shrink-0 tabular-nums num-latin text-muted-foreground">{row.total_qty_sold}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('role.marketing.promos')}</CardTitle>
            <CardDescription>{t('role.marketing.promos_hint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {promos.isLoading ? (
              <p className="text-sm text-muted-foreground">…</p>
            ) : promoRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('role.empty')}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {promoRows.map((row) => (
                  <li key={row.discount_rule_id} className="flex justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{row.name}</span>{' '}
                      <span className="font-mono text-xs text-muted-foreground num-latin">({row.code})</span>
                    </span>
                    <span className="shrink-0 tabular-nums num-latin text-muted-foreground">{row.usage_count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('role.marketing.inventory_alerts')}</CardTitle>
          <CardDescription>{t('role.marketing.inventory_alerts_hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums num-latin">
            {alerts.isLoading ? '…' : (alerts.data?.items?.length ?? 0)}
          </p>
        </CardContent>
      </Card>

      {(top.isError || promos.isError || kpis.isError) && (
        <p className="text-sm text-destructive">{t('role.load_error')}</p>
      )}

    </RoleDashboardShell>
  );
}
