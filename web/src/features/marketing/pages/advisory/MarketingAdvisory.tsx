import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { isAxiosError } from '@/api/client';
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

import type { MarketingAdvisoryResponse } from '../../api';
import { postMarketingAdvisory } from '../../api';

export default function MarketingAdvisory() {
  const { t } = useTranslation('marketing');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [branch, setBranch] = useState<string>('__all');
  const [days, setDays] = useState('30');
  const [result, setResult] = useState<MarketingAdvisoryResponse | null>(null);
  const [friendlyError, setFriendlyError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      postMarketingAdvisory({
        branch_id: branch === '__all' ? null : Number(branch),
        days_ahead: Number.parseInt(days, 10) || 30,
        top_products_limit: 10,
        max_suggestions: 5,
      }),
    onSuccess: (r) => {
      setResult(r);
      setFriendlyError(null);
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
          <Label>{t('advisory.days')}</Label>
          <Input className="w-[120px]" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
        </div>
        <Button type="button" disabled={m.isPending} onClick={() => void m.mutate()}>
          {t('advisory.run')}
        </Button>
      </div>
      {friendlyError ? <p className="text-sm text-destructive">{friendlyError}</p> : null}
      {result?.suggestions?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('advisory.empty')}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(result?.suggestions ?? []).map((s, i) => (
          <Card key={`${s.title}-${i}`}>
            <CardHeader>
              <CardTitle className="text-base">{s.title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t('advisory.priority')}: {s.priority} · {t('advisory.confidence')}: {s.confidence}
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
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
