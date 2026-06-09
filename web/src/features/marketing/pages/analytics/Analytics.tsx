import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { components } from '@/api/generated/schema';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DateRangeFields } from '@/components/shared/form/DateRangeFields';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { MARKETING_INVENTORY_INSIGHTS_PATH } from '@/features/marketing/paths';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatCurrency, formatCurrencyWithLeadingSymbol } from '@/lib/format';

import {
  promotionPerformanceQueryOptions,
  salesTrendForPeriodQueryOptions,
  topSellingQueryOptions,
} from '../../queries';

type TopRow = components['schemas']['TopSellingProductItem'];
type PromoRow = components['schemas']['PromotionPerformanceItem'];

const DISPLAY_CURRENCY = 'USD';

function bestWeekdayIndex(rows: { date: string; total: number }[]): number | null {
  if (!rows.length) return null;
  const sums = new Array(7).fill(0);
  for (const r of rows) {
    const d = new Date(`${r.date}T12:00:00Z`);
    const wd = d.getUTCDay();
    sums[wd] += r.total;
  }
  let max = -1;
  let idx = 0;
  sums.forEach((v, i) => {
    if (v > max) {
      max = v;
      idx = i;
    }
  });
  return max > 0 ? idx : null;
}

export default function Analytics() {
  const { t } = useTranslation('marketing');
  const [ps, setPs] = useState(() => utcCalendarDayKey(subDays(now(), 30)));
  const [pe, setPe] = useState(() => utcCalendarDayKey(now()));
  const [applied, setApplied] = useState({ ps, pe });

  const periodStartIso = `${applied.ps}T00:00:00Z`;
  const periodEndIso = `${applied.pe}T23:59:59Z`;

  const top = useQuery(
    topSellingQueryOptions({ limit: 10, period_start: periodStartIso, period_end: periodEndIso }),
  );
  const promos = useQuery(promotionPerformanceQueryOptions(10));
  const trend = useQuery({
    ...salesTrendForPeriodQueryOptions(applied.ps, applied.pe),
  });

  const topItems = top.data?.items ?? [];

  const leadingProduct = useMemo(() => {
    if (!topItems.length) return null;
    return [...topItems].sort(
      (a, b) =>
        Number.parseFloat(String(b.total_revenue ?? '0')) -
        Number.parseFloat(String(a.total_revenue ?? '0')),
    )[0] ?? null;
  }, [topItems]);

  const summary = useMemo(() => {
    const totalQty = topItems.reduce((acc, row) => acc + (row.total_qty_sold ?? 0), 0);
    const totalRev = topItems.reduce(
      (acc, row) => acc + Number.parseFloat(String(row.total_revenue ?? '0')),
      0,
    );
    const avgBasket = totalQty > 0 ? totalRev / totalQty : 0;
    return {
      totalRev,
      avgBasket,
      loading: top.isLoading,
    };
  }, [topItems, top.isLoading]);

  const weekdayIdx = useMemo(
    () => bestWeekdayIndex(trend.data?.data ?? []),
    [trend.data?.data],
  );

  const topChartData = useMemo(
    () =>
      topItems.map((row) => ({
        name: row.product_name,
        value: row.total_qty_sold,
      })),
    [topItems],
  );

  const promoItems = promos.data?.items ?? [];
  const promoChartData = useMemo(
    () =>
      promoItems.map((row) => ({
        name: row.code,
        value: row.usage_count,
      })),
    [promoItems],
  );

  const topTableCols = useMemo(
    () =>
      defineColumns<TopRow>()([
        { id: 'n', accessorKey: 'product_name', header: t('charts.table_product') },
        {
          id: 'q',
          accessorKey: 'total_qty_sold',
          header: t('charts.table_qty'),
          cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
        },
        {
          id: 'r',
          accessorKey: 'total_revenue',
          header: t('charts.table_revenue'),
          cell: ({ getValue }) => (
            <div className="flex w-full justify-end" dir="ltr">
              <span className="tabular-nums">
                {formatCurrency(Number.parseFloat(String(getValue())), DISPLAY_CURRENCY)}
              </span>
            </div>
          ),
        },
      ]),
    [t],
  );

  const promoTableCols = useMemo(
    () =>
      defineColumns<PromoRow>()([
        { id: 'c', accessorKey: 'code', header: t('charts.table_code') },
        { id: 'n', accessorKey: 'name', header: t('charts.table_promo_name') },
        {
          id: 'u',
          accessorKey: 'usage_count',
          header: t('charts.table_usage'),
          cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
        },
        {
          id: 'd',
          accessorKey: 'total_discount_given',
          header: t('charts.table_discount'),
          cell: ({ getValue }) => (
            <div className="flex w-full justify-end" dir="ltr">
              <span className="tabular-nums">
                {formatCurrency(Number.parseFloat(String(getValue())), DISPLAY_CURRENCY)}
              </span>
            </div>
          ),
        },
      ]),
    [t],
  );

  const hasError = top.isError || promos.isError || trend.isError;

  const axisBottom = 56;
  const yAxisWidth = 52;
  const yTickMargin = 14;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitle')} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('analytics.filters_title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <DateRangeFields
            fromValue={ps}
            toValue={pe}
            onFromChange={setPs}
            onToChange={setPe}
            fromLabel={<Label>{t('analytics.period_start')}</Label>}
            toLabel={<Label>{t('analytics.period_end')}</Label>}
          />
          <Button type="button" onClick={() => setApplied({ ps, pe })} disabled={top.isFetching}>
            {t('analytics.apply')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('analytics.kpi_top_product')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-lg font-semibold leading-snug line-clamp-3 min-h-[3.5rem]"
              title={leadingProduct?.product_name ?? undefined}
            >
              {summary.loading ? '…' : (leadingProduct?.product_name ?? '—')}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('analytics.kpi_avg_basket')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-start">
            <span dir="ltr" className="text-2xl font-semibold tabular-nums num-latin [unicode-bidi:isolate]">
              {summary.loading ? '…' : formatCurrencyWithLeadingSymbol(summary.avgBasket, DISPLAY_CURRENCY)}
            </span>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('analytics.kpi_total_top_revenue')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-start">
            <span dir="ltr" className="text-2xl font-semibold tabular-nums num-latin [unicode-bidi:isolate]">
              {summary.loading ? '…' : formatCurrencyWithLeadingSymbol(summary.totalRev, DISPLAY_CURRENCY)}
            </span>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('analytics.kpi_best_sales_day')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {trend.isLoading ? '…' : weekdayIdx == null ? '—' : t(`analytics.weekday.${weekdayIdx}`)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to={MARKETING_INVENTORY_INSIGHTS_PATH}>{t('analytics.link_inventory_insights')}</Link>
        </Button>
      </div>

      {hasError ? <p className="text-sm text-destructive">{t('analytics.load_error')}</p> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title={t('charts.top_title')} description={t('charts.top_desc')}>
          <div className="mb-6 h-72 w-full min-h-[280px]">
            {topChartData.length === 0 && !top.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('charts.empty_top')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topChartData}
                  margin={{ top: 12, right: 16, left: 12, bottom: axisBottom }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={0}
                    textAnchor="middle"
                    height={axisBottom}
                    tickMargin={10}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    width={yAxisWidth}
                    tickMargin={yTickMargin}
                  />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <DataTable
            mode="client"
            columns={topTableCols}
            data={topItems}
            isLoading={top.isLoading}
            isError={top.isError}
            onRetry={() => void top.refetch()}
            showPagination={false}
            showSearch={false}
            emptyState={<p className="text-sm text-muted-foreground">{t('charts.empty_top')}</p>}
          />
        </SectionCard>

        <SectionCard title={t('charts.promo_title')} description={t('charts.promo_desc')}>
          <div className="mb-6 h-72 w-full min-h-[280px]">
            {promoChartData.length === 0 && !promos.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('charts.empty_promo')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={promoChartData}
                  margin={{ top: 12, right: 16, left: 12, bottom: axisBottom }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={0}
                    textAnchor="middle"
                    height={axisBottom}
                    tickMargin={10}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    width={yAxisWidth}
                    tickMargin={yTickMargin}
                  />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} />
                  <Bar dataKey="value" fill="hsl(217 91% 60% / 0.85)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <DataTable
            mode="client"
            columns={promoTableCols}
            data={promoItems}
            isLoading={promos.isLoading}
            isError={promos.isError}
            onRetry={() => void promos.refetch()}
            showPagination={false}
            showSearch={false}
            emptyState={<p className="text-sm text-muted-foreground">{t('charts.empty_promo')}</p>}
          />
        </SectionCard>
      </div>
    </div>
  );
}
