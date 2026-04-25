import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';

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

import { postCampaignSegmentExport, postTargetedCampaigns } from '../../api';
import type { TargetedCampaignResponse } from '../../api';

const SEGMENTS = ['champions', 'loyal', 'at_risk', 'lost'] as const;

export default function CampaignAdvisor() {
  const { t } = useTranslation('marketing');
  const [lookback, setLookback] = useState('90');
  const [minPurchases, setMinPurchases] = useState('2');
  const [result, setResult] = useState<TargetedCampaignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [segmentExport, setSegmentExport] = useState<string>(SEGMENTS[0]);

  const m = useMutation({
    mutationFn: () =>
      postTargetedCampaigns({
        lookback_days: Number.parseInt(lookback, 10) || 90,
        min_purchases: Number.parseInt(minPurchases, 10) || 2,
        max_campaigns: 5,
      }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
    },
    onError: (e) => {
      setResult(null);
      if (isAxiosError(e)) {
        const d = e.response?.data as { detail?: unknown } | undefined;
        setError(typeof d?.detail === 'string' ? d.detail : t('campaigns.error_generic'));
      } else {
        setError(t('campaigns.error_generic'));
      }
    },
  });

  const exportCsv = async () => {
    try {
      const blob = await postCampaignSegmentExport({
        segment_code: segmentExport,
        lookback_days: Number.parseInt(lookback, 10) || 90,
        min_purchases: Number.parseInt(minPurchases, 10) || 2,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'segment_customers.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('campaigns.export_ok'));
    } catch (e) {
      if (isAxiosError(e)) {
        toast.error(t('campaigns.export_fail'));
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('campaigns.title')}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{t('campaigns.hint')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('campaigns.lookback')}</Label>
          <Input className="w-[100px]" value={lookback} onChange={(e) => setLookback(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label>{t('campaigns.min_purchases')}</Label>
          <Input className="w-[100px]" value={minPurchases} onChange={(e) => setMinPurchases(e.target.value)} />
        </div>
        <Button type="button" disabled={m.isPending} onClick={() => void m.mutate()}>
          {t('campaigns.run')}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!m.isPending && result && (result.campaigns?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">{t('campaigns.empty')}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(result?.campaigns ?? []).map((c, i) => (
          <Card key={`${c.title}-${i}`}>
            <CardHeader>
              <CardTitle className="text-base">{c.title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {c.segment.segment_code} · {c.channel} · {t('campaigns.lift')}: {c.expected_lift_pct}%
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{c.segment.description}</p>
              <p>{c.offer}</p>
              <p className="font-medium">{c.call_to_action}</p>
              <p className="text-xs text-muted-foreground">{c.segment.rationale}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="grid gap-1">
          <Label>{t('campaigns.export_segment')}</Label>
          <Select value={segmentExport} onValueChange={setSegmentExport}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEGMENTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={() => void exportCsv()}>
          {t('campaigns.export_csv')}
        </Button>
      </div>
    </div>
  );
}
