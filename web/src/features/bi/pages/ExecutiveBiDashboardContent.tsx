import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import {
  AreaChart,
  ChartError,
  ChartSkeleton,
  KpiCard,
  kpiCardGridClassName,
  LineChart,
  PieChart,
} from '@/components/shared/charts';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { MARKETING_SALES_INVOICES_PATH } from '@/features/marketing/paths';
import { usePermission } from '@/hooks/usePermission';
import { format, now } from '@/lib/date';
import { cn } from '@/lib/utils';
import {
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
} from '@/lib/format';

import type { ExecutiveKpiRead } from '../api';
import { executiveKpisQueryOptions } from '../queries';

const DISPLAY_CURRENCY = 'USD';

function num(s: string | undefined | null): number {
  if (s == null || s === '') return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Heavy executive BI surface (charts + tables). Lazy-loaded from
 * `DashboardPage` so the Recharts chunk parses only after navigation.
 */
export default function ExecutiveBiDashboardContent() {
  const { t } = useTranslation('bi');
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const canViewAccounting = usePermission('accounting', 'read');
  const canViewInvoices = usePermission('sales_invoices', 'read');
  const canViewCatalog = usePermission('catalog', 'read');
  const canViewPurchasing = usePermission('purchase_orders', 'read');
  const [periodEnd, setPeriodEnd] = useState(() => format(now(), 'yyyy-MM-dd'));
  const [periodStart, setPeriodStart] = useState(() =>
    format(subDays(now(), 30), 'yyyy-MM-dd'),
  );
  const [branchFilter, setBranchFilter] = useState<string>(
    activeBranchId != null ? String(activeBranchId) : 'all',
  );

  const qArgs = useMemo(() => {
    const args: { period_start?: string; period_end?: string; branch_id?: number } = {
      period_start: periodStart,
      period_end: periodEnd,
    };
    if (branchFilter !== 'all' && branchFilter !== '') {
      const id = Number(branchFilter);
      if (!Number.isNaN(id)) args.branch_id = id;
    }
    return args;
  }, [periodStart, periodEnd, branchFilter]);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    ...executiveKpisQueryOptions(qArgs),
  });

  const trendData = useMemo(() => {
    const rows = data?.revenue_trend ?? [];
    return rows.map((r) => ({
      bucket_date: r.bucket_date,
      gross_sales: num(r.gross_sales as unknown as string),
    }));
  }, [data?.revenue_trend]);

  const mixData = useMemo(() => {
    const rows = data?.category_mix ?? [];
    return rows.map((r) => ({
      category_name: r.category_name,
      gross_sales: num(r.gross_sales as unknown as string),
    }));
  }, [data?.category_mix]);

  const topCols = useMemo(
    () =>
      defineColumns<NonNullable<ExecutiveKpiRead['top_products']>[0]>()([
        { id: 'n', accessorKey: 'product_name', header: t('tables.product') },
        { id: 'q', accessorKey: 'qty_sold', header: t('tables.qty') },
        {
          id: 'r',
          accessorKey: 'revenue',
          header: t('tables.revenue'),
          cell: ({ getValue }) => (
            <span className="tabular-nums num-latin">
              {formatCurrency(num(String(getValue())), DISPLAY_CURRENCY)}
            </span>
          ),
        },
      ]),
    [t],
  );

  const poCols = useMemo(
    () =>
      defineColumns<NonNullable<ExecutiveKpiRead['recent_purchase_orders']>[0]>()([
        { id: 'id', accessorKey: 'id', header: t('tables.po_id') },
        { id: 'sup', accessorKey: 'supplier_name', header: t('tables.supplier') },
        { id: 'st', accessorKey: 'status', header: t('tables.status') },
        {
          id: 'at',
          accessorKey: 'created_at',
          header: t('tables.created'),
          cell: ({ getValue }) => (
            <span className="num-latin">
              {typeof getValue() === 'string' ? String(getValue()).slice(0, 10) : '—'}
            </span>
          ),
        },
      ]),
    [t],
  );

  const marginLabel =
    data?.gross_margin_ratio != null && data.gross_margin_ratio !== ''
      ? formatPercent(Number.parseFloat(String(data.gross_margin_ratio)), { fractionDigits: 1 })
      : '—';
  const invoiceRegisterLink = canViewInvoices ? MARKETING_SALES_INVOICES_PATH : undefined;
  const revenueLink = invoiceRegisterLink ?? (canViewAccounting ? '/accounting/income-statement' : undefined);
  const accountingLink = canViewAccounting ? '/accounting/income-statement' : undefined;

  const grossSales = data ? num(data.gross_sales) : 0;
  const avgTicket = data ? num(data.avg_ticket) : 0;
  const invoiceCount = data?.invoice_count ?? 0;
  const recentPoCount = data?.recent_purchase_orders?.length ?? 0;
  const purchasingLink = canViewPurchasing ? '/purchasing/orders' : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('filters.title')}</CardTitle>
          <CardDescription>{t('filters.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <span className="text-sm font-medium">{t('filters.period_start')}</span>
            <DateField value={periodStart} onChange={(next) => setPeriodStart(next)} />
          </div>
          <div className="grid gap-1">
            <span className="text-sm font-medium">{t('filters.period_end')}</span>
            <DateField value={periodEnd} onChange={(next) => setPeriodEnd(next)} />
          </div>
          <div className="grid min-w-[200px] gap-1">
            <span className="text-sm font-medium">{t('filters.branch')}</span>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('filters.branch_all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.branch_all')}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => void refetch()} disabled={isFetching}>
            {t('filters.apply')}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className={cn(kpiCardGridClassName, 'lg:grid-cols-5')}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border/80 bg-muted/40 shadow-sm" />
          ))}
        </div>
      ) : isError || !data ? (
        <ChartError message={t('error.load')} onRetry={() => void refetch()} />
      ) : (
        <>
          <section className={cn(kpiCardGridClassName, 'lg:grid-cols-5')}>
            <KpiCard
              title={t('kpi.revenue')}
              value={formatCompactCurrency(grossSales, DISPLAY_CURRENCY)}
              {...(revenueLink ? { to: revenueLink } : {})}
              sparkline={
                trendData.length > 1 ? (
                  <div className="h-14 w-full">
                    <LineChart data={trendData} xKey="bucket_date" yKey="gross_sales" height={56} />
                  </div>
                ) : null
              }
            />
            <KpiCard
              title={t('kpi.margin')}
              value={marginLabel}
              {...(accountingLink ? { to: accountingLink } : {})}
            />
            <KpiCard
              title={t('kpi.orders')}
              value={formatCompactNumber(invoiceCount)}
              {...(invoiceRegisterLink ? { to: invoiceRegisterLink } : {})}
            />
            <KpiCard
              title={t('kpi.avg_ticket')}
              value={formatCompactCurrency(avgTicket, DISPLAY_CURRENCY)}
              {...(invoiceRegisterLink ? { to: invoiceRegisterLink } : {})}
            />
            <KpiCard
              title={t('kpi.recent_po')}
              value={formatCompactNumber(recentPoCount)}
              {...(purchasingLink ? { to: purchasingLink } : {})}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card className="flex min-h-[380px] flex-col">
              <CardHeader>
                <CardTitle className="text-base">{t('charts.revenue_trend')}</CardTitle>
                <CardDescription>{t('charts.revenue_trend_hint')}</CardDescription>
              </CardHeader>
              <CardContent className="min-h-[300px] flex-1">
                {trendData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('empty.trend')}</p>
                ) : isFetching ? (
                  <ChartSkeleton />
                ) : (
                  <AreaChart
                    data={trendData}
                    xKey="bucket_date"
                    yKey="gross_sales"
                    height={280}
                    xAxisLabel={t('charts.axis_day')}
                    yAxisLabel={t('charts.axis_revenue')}
                  />
                )}
              </CardContent>
              {canViewInvoices ? (
                <CardFooter className="pt-0">
                  <Button variant="link" className="h-auto p-0 text-sm" asChild>
                    <Link to={MARKETING_SALES_INVOICES_PATH}>{t('charts.trend_view_invoices')}</Link>
                  </Button>
                </CardFooter>
              ) : null}
            </Card>
            <Card className="flex min-h-[380px] flex-col">
              <CardHeader>
                <CardTitle className="text-base">{t('charts.category_mix')}</CardTitle>
                <CardDescription>{t('charts.category_mix_hint')}</CardDescription>
              </CardHeader>
              <CardContent className="min-h-[300px] flex-1">
                {mixData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('empty.mix')}</p>
                ) : (
                  <PieChart data={mixData} nameKey="category_name" valueKey="gross_sales" height={300} />
                )}
              </CardContent>
              {canViewCatalog ? (
                <CardFooter className="pt-0">
                  <Button variant="link" className="h-auto p-0 text-sm" asChild>
                    <Link to="/catalog/products">{t('charts.mix_view_catalog')}</Link>
                  </Button>
                </CardFooter>
              ) : null}
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('tables.top_products_title')}</CardTitle>
                <CardDescription>{t('tables.top_products_hint')}</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  mode="client"
                  columns={topCols}
                  data={data.top_products ?? []}
                  isLoading={false}
                  isError={false}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('tables.recent_pos_title')}</CardTitle>
                <CardDescription>{t('tables.recent_po_hint')}</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  mode="client"
                  columns={poCols}
                  data={data.recent_purchase_orders ?? []}
                  isLoading={false}
                  isError={false}
                />
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
