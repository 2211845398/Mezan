import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

import {
  inventoryAlertsQueryOptions,
  promotionPerformanceQueryOptions,
  slowMovingQueryOptions,
  topSellingQueryOptions,
} from '../../queries';

export default function Analytics() {
  const { t } = useTranslation('marketing');
  const [ps, setPs] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [pe, setPe] = useState(() => new Date().toISOString().slice(0, 10));
  const [applied, setApplied] = useState({ ps, pe });

  const top = useQuery(
    topSellingQueryOptions({ limit: 10, period_start: `${applied.ps}T00:00:00Z`, period_end: `${applied.pe}T23:59:59Z` }),
  );
  const slow = useQuery(slowMovingQueryOptions({ threshold_qty: 5, limit: 10 }));
  const alerts = useQuery(inventoryAlertsQueryOptions(30));
  const promos = useQuery(promotionPerformanceQueryOptions(10));

  const summary = useMemo(
    () => [
      { title: t('analytics.top_count'), value: String(top.data?.items?.length ?? 0), loading: top.isLoading },
      { title: t('analytics.slow_count'), value: String(slow.data?.items?.length ?? 0), loading: slow.isLoading },
      { title: t('analytics.alerts_count'), value: String(alerts.data?.items?.length ?? 0), loading: alerts.isLoading },
      { title: t('analytics.promo_count'), value: String(promos.data?.items?.length ?? 0), loading: promos.isLoading },
    ],
    [alerts.data, promos.data, slow.data, top.data, t, top.isLoading, slow.isLoading, alerts.isLoading, promos.isLoading],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('analytics.title')}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('analytics.period_start')}</Label>
          <DateField value={ps} onChange={setPs} />
        </div>
        <div className="grid gap-1">
          <Label>{t('analytics.period_end')}</Label>
          <DateField value={pe} onChange={setPe} />
        </div>
        <Button type="button" onClick={() => setApplied({ ps, pe })}>
          {t('analytics.apply')}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{s.loading ? '…' : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {top.isError || slow.isError || alerts.isError || promos.isError ? (
        <p className="text-sm text-destructive">{t('analytics.load_error')}</p>
      ) : null}
    </div>
  );
}
