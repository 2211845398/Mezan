import { useMutation } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatIso } from '@/lib/date';
import { newIdempotencyKey } from '@/lib/idempotency';
import { notify } from '@/lib/toast';

import { type HrAnomaly, type HrAnomalyResponse, postHrAnomalies } from '../../api';

export default function AnomaliesDashboard() {
  const { t } = useTranslation('hr');
  const { t: tc } = useTranslation('common');
  const [lookback, setLookback] = useState(14);
  const [branchId, setBranchId] = useState<string>('');
  const [res, setRes] = useState<HrAnomalyResponse | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const runKeyRef = useRef<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const key = runKeyRef.current ?? newIdempotencyKey();
      runKeyRef.current = key;
      return postHrAnomalies(
        {
          preset: 'custom',
          lookback_days: lookback,
          branch_id: branchId ? Number(branchId) : null,
          max_anomalies: 50,
        },
        key,
      );
    },
    onSuccess: (r) => {
      setRes(r);
      setHasRun(true);
      runKeyRef.current = null;
      notify.success(tc('toasts.analysis_complete'));
    },
    onError: (error) => {
      runKeyRef.current = null;
      notifyApiError(error, t('hr_errors.generic'));
    },
  });

  const columns = useMemo(
    () =>
      defineColumns<HrAnomaly>()([
        {
          id: 'employee',
          header: t('anomalies.col.employee'),
          cell: ({ row }) => row.original.employee_name ?? '—',
        },
        {
          id: 'issue',
          header: t('anomalies.col.issue'),
          cell: ({ row }) => t(`anomalies.issue.${row.original.anomaly_type}`),
        },
        {
          id: 'severity',
          header: t('anomalies.col.severity'),
          cell: ({ row }) => {
            const s = row.original.severity;
            const variant = s === 'high' ? 'destructive' : s === 'medium' ? 'default' : 'secondary';
            return <Badge variant={variant}>{t(`anomalies.severity.${s}`)}</Badge>;
          },
        },
        {
          id: 'explanation',
          header: t('anomalies.col.explanation'),
          cell: ({ row }) => {
            const a = row.original;
            const workDate = a.period_start
              ? formatIso(a.period_start, 'yyyy-MM-dd')
              : undefined;
            return (
              <span className="max-w-md text-sm">
                {t(`anomalies.explanation.${a.anomaly_type}`, {
                  date: workDate,
                  hours: a.observed_value,
                })}
              </span>
            );
          },
        },
        {
          id: 'suggestion',
          header: t('anomalies.col.suggestion'),
          cell: ({ row }) => (
            <span className="max-w-md text-sm text-muted-foreground">
              {t(`anomalies.suggestion.${row.original.anomaly_type}`)}
            </span>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('anomalies.title')} />

      <SectionCard title={t('anomalies.filters_title')}>
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-[minmax(0,120px)_minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-1">
            <Label htmlFor="lb">{t('anomalies.lookback')}</Label>
            <Input
              id="lb"
              type="number"
              min={1}
              max={90}
              value={lookback}
              onChange={(e) => setLookback(Number(e.target.value) || 14)}
              className="w-full"
            />
          </div>
          <div className="grid min-w-0 gap-1">
            <BranchCombobox
              label={t('anomalies.branch')}
              value={branchId ? Number(branchId) : null}
              onChange={(id) => setBranchId(id == null ? '' : String(id))}
              allowClear
              clearLabel={t('attendance.all')}
              includeArchived={false}
              showCode={false}
            />
          </div>
          <div className="flex min-[480px]:col-span-2 lg:col-span-1">
            <Button
              type="button"
              className="w-full lg:w-auto"
              onClick={() => void run.mutate()}
              disabled={run.isPending}
            >
              {t('anomalies.run')}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('anomalies.results_title')}>
        {run.isPending ? (
          <p className="text-sm text-muted-foreground">{t('anomalies.running')}</p>
        ) : !hasRun ? (
          <p className="text-sm text-muted-foreground">{t('anomalies.not_run')}</p>
        ) : res && res.anomalies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('anomalies.empty')}</p>
        ) : res ? (
          <DataTable mode="client" columns={columns} data={res.anomalies} />
        ) : null}
      </SectionCard>
    </div>
  );
}
