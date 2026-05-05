import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const run = useMutation({
    mutationFn: async () => {
      const key = runKeyRef.current ?? newIdempotencyKey();
      runKeyRef.current = key;
      return postHrAnomalies(
        {
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
          cell: ({ row }) =>
            row.original.employee_name ? (
              <span>
                {row.original.employee_name}{' '}
                <span className="text-muted-foreground">(#{row.original.employee_profile_id})</span>
              </span>
            ) : (
              `#${row.original.employee_profile_id}`
            ),
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
          cell: ({ row }) => <span className="max-w-md text-sm">{row.original.rationale}</span>,
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
      <PageHeader title={t('anomalies.title')} subtitle={t('anomalies.run_hint')} />

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
            <Label htmlFor="br-sel">{t('anomalies.branch')}</Label>
            <Select value={branchId || '__all'} onValueChange={(v) => setBranchId(v === '__all' ? '' : v)}>
              <SelectTrigger id="br-sel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t('attendance.all')}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t('anomalies.meta_line', {
                model: res.model,
                when: formatIso(res.generated_at, 'yyyy-MM-dd HH:mm'),
              })}
            </p>
            <DataTable mode="client" columns={columns} data={res.anomalies} />
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">{t('anomalies.advanced')}</summary>
              <pre className="mt-3 max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(res.facts_used, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
