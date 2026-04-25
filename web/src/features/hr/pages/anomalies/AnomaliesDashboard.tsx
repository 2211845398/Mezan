import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { newIdempotencyKey } from '@/lib/idempotency';

import { postHrAnomalies, type HrAnomalyResponse } from '../../api';

export default function AnomaliesDashboard() {
  const { t } = useTranslation('hr');
  const [lookback, setLookback] = useState(14);
  const [branchId, setBranchId] = useState('');
  const [res, setRes] = useState<HrAnomalyResponse | null>(null);
  const runKeyRef = useRef<string | null>(null);

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
      runKeyRef.current = null;
    },
    onError: () => {
      runKeyRef.current = null;
      toast.error(t('hr_errors.generic'));
    },
  });

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">{t('anomalies.title')}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="lb">{t('anomalies.lookback')}</Label>
          <Input
            id="lb"
            type="number"
            min={1}
            max={90}
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value) || 14)}
            className="w-28"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="br">{t('anomalies.branch')}</Label>
          <Input
            id="br"
            type="number"
            placeholder="optional"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-32"
          />
        </div>
        <Button type="button" onClick={() => void run.mutate()} disabled={run.isPending}>
          {t('anomalies.run')}
        </Button>
      </div>
      {res ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('anomalies.model')}: {res.model} · {res.generated_at}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('anomalies.col.employee')}</TableHead>
                <TableHead>{t('anomalies.col.type')}</TableHead>
                <TableHead>{t('anomalies.col.severity')}</TableHead>
                <TableHead>{t('anomalies.col.rationale')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {res.anomalies.map((a, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {a.employee_name ?? '—'} (#{a.employee_profile_id})
                  </TableCell>
                  <TableCell>{a.anomaly_type}</TableCell>
                  <TableCell>{a.severity}</TableCell>
                  <TableCell className="max-w-md text-sm">{a.rationale}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <details className="text-xs">
            <summary>{t('anomalies.facts')}</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded border p-2">
              {JSON.stringify(res.facts_used, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
