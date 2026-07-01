import { useMutation, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { isAxiosError } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { notify } from '@/lib/toast';

import type { MarketingAdvisoryResponse } from '../../api';
import { postMarketingAdvisory } from '../../api';

const FALLBACK_TOAST_CLASS =
  '!border-amber-400/70 !bg-amber-50 !text-amber-950 shadow-sm dark:!border-amber-600 dark:!bg-amber-950/40 dark:!text-amber-50';

const LOOKBACK_PRESETS = ['30', '60', '90'] as const;

function advisoryPriorityLabel(t: TFunction<'marketing'>, raw: string): string {
  const k = raw?.toLowerCase?.() ?? '';
  if (k === 'high' || k === 'medium' || k === 'low') {
    return t(`advisory.priority_level.${k}`);
  }
  return raw;
}

type FactsUsed = MarketingAdvisoryResponse['facts_used'] & {
  analysis_period?: {
    lookback_days?: number;
    period_start?: string;
    period_end?: string;
    expiry_horizon_days?: number;
  };
  sales_summary?: { invoice_count?: number; avg_basket?: string | number };
  customer_aggregates?: { active_customers?: number; repeat_rate_pct?: number };
  top_selling_products?: unknown[];
  slow_moving_products?: unknown[];
  expiring_inventory?: unknown[];
  co_bought_pairs?: unknown[];
  promotion_performance?: unknown[];
};

function AdvisoryFactsSummary({
  facts,
  t,
}: {
  facts: FactsUsed;
  t: TFunction<'marketing'>;
}) {
  const period = facts.analysis_period;
  const sales = facts.sales_summary;
  const customers = facts.customer_aggregates;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t('advisory.facts_summary_title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
        {period?.lookback_days != null ? (
          <p>
            {t('advisory.facts_period')}:{' '}
            <span dir="ltr" className="num-latin tabular-nums text-foreground">
              {period.lookback_days} {t('advisory.lookback_days')}
            </span>
          </p>
        ) : null}
        {sales?.invoice_count != null ? (
          <p>
            {t('advisory.facts_invoices')}:{' '}
            <span dir="ltr" className="num-latin tabular-nums text-foreground">
              {sales.invoice_count}
            </span>
          </p>
        ) : null}
        {sales?.avg_basket != null ? (
          <p>
            {t('advisory.facts_avg_basket')}:{' '}
            <span dir="ltr" className="num-latin tabular-nums text-foreground">
              {sales.avg_basket}
            </span>
          </p>
        ) : null}
        {customers?.active_customers != null ? (
          <p>
            {t('advisory.facts_customers')}:{' '}
            <span dir="ltr" className="num-latin tabular-nums text-foreground">
              {customers.active_customers}
            </span>
          </p>
        ) : null}
        {customers?.repeat_rate_pct != null ? (
          <p>
            {t('advisory.facts_repeat_rate')}:{' '}
            <span dir="ltr" className="num-latin tabular-nums text-foreground">
              {customers.repeat_rate_pct}%
            </span>
          </p>
        ) : null}
        <p>
          {t('advisory.facts_top_products')}:{' '}
          <span dir="ltr" className="num-latin tabular-nums text-foreground">
            {facts.top_selling_products?.length ?? 0}
          </span>
        </p>
        <p>
          {t('advisory.facts_slow_products')}:{' '}
          <span dir="ltr" className="num-latin tabular-nums text-foreground">
            {facts.slow_moving_products?.length ?? 0}
          </span>
        </p>
        <p>
          {t('advisory.facts_expiring')}:{' '}
          <span dir="ltr" className="num-latin tabular-nums text-foreground">
            {facts.expiring_inventory?.length ?? 0}
          </span>
        </p>
        <p>
          {t('advisory.facts_co_bought')}:{' '}
          <span dir="ltr" className="num-latin tabular-nums text-foreground">
            {facts.co_bought_pairs?.length ?? 0}
          </span>
        </p>
        <p>
          {t('advisory.facts_promotions')}:{' '}
          <span dir="ltr" className="num-latin tabular-nums text-foreground">
            {facts.promotion_performance?.length ?? 0}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

export default function MarketingAdvisory() {
  const { t } = useTranslation('marketing');
  const { t: tc } = useTranslation('common');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [branch, setBranch] = useState<string>('__all');
  const [lookback, setLookback] = useState<string>('30');
  const [daysAhead, setDaysAhead] = useState('30');
  const [result, setResult] = useState<MarketingAdvisoryResponse | null>(null);
  const [friendlyError, setFriendlyError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      postMarketingAdvisory({
        branch_id: branch === '__all' ? null : Number(branch),
        lookback_days: Number.parseInt(lookback, 10) || 30,
        days_ahead: Number.parseInt(daysAhead, 10) || 30,
        top_products_limit: 10,
        max_suggestions: 5,
      }),
    onSuccess: (r) => {
      setResult(r);
      setFriendlyError(null);
      if (r.model === 'deterministic_fallback') {
        notify.warning(t('advisory.fallback_notice_toast'), {
          id: 'marketing-advisory-fallback',
          durationMs: 9000,
          className: FALLBACK_TOAST_CLASS,
        });
      } else {
        notify.success(tc('toasts.analysis_complete'));
      }
    },
    onError: (e) => {
      setResult(null);
      if (isAxiosError(e)) {
        const d = e.response?.data as { detail?: unknown } | undefined;
        const msg =
          typeof d?.detail === 'string'
            ? d.detail
            : Array.isArray(d?.detail)
              ? d.detail.map((x: { msg?: string }) => x.msg).join(', ')
              : t('advisory.error_generic');
        setFriendlyError(msg);
      } else {
        setFriendlyError(t('advisory.error_generic'));
      }
      toast.error(t('advisory.run_failed'));
    },
  });

  const isFallback = result?.model === 'deterministic_fallback';

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('advisory.title')}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{t('advisory.hint')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('advisory.branch')}</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('advisory.all_branches')}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('advisory.lookback')}</Label>
          <Select value={lookback} onValueChange={setLookback}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOOKBACK_PRESETS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d} {t('advisory.lookback_days')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>{t('advisory.days')}</Label>
          <Input
            className="w-[120px]"
            value={daysAhead}
            onChange={(e) => setDaysAhead(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <Button type="button" disabled={m.isPending} onClick={() => void m.mutate()}>
          {t('advisory.run')}
        </Button>
      </div>
      {friendlyError ? <p className="text-sm text-destructive">{friendlyError}</p> : null}
      {result ? (
        <div className="flex flex-col gap-3">
          <Badge variant={isFallback ? 'secondary' : 'default'} className="w-fit">
            {isFallback
              ? t('advisory.source_fallback')
              : t('advisory.source_ai', { model: result.model })}
          </Badge>
          <AdvisoryFactsSummary facts={result.facts_used as FactsUsed} t={t} />
        </div>
      ) : null}
      {result?.suggestions?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('advisory.empty')}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(result?.suggestions ?? []).map((s, i) => (
          <Card key={`${s.title}-${i}`}>
            <CardHeader className={isFallback ? 'text-start' : undefined}>
              <CardTitle className="text-base" dir="auto">
                {s.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t('advisory.priority')}: {advisoryPriorityLabel(t, s.priority)} · {t('advisory.confidence')}:{' '}
                <span dir="ltr" className="num-latin inline-block tabular-nums">
                  {s.confidence}
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm" dir="auto">
              <p>{s.rationale}</p>
              <ul className="list-inside list-disc">
                {(s.action_items ?? []).map((a, j) => (
                  <li key={j}>{a}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
