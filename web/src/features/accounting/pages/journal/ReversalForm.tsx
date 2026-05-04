import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { now, utcCalendarDayKey } from '@/lib/date';

import { reverseJournalEntry } from '../../api';
import { accountingKeys, journalDetailQueryOptions } from '../../queries';

export default function ReversalForm() {
  const { id } = useParams<{ id: string }>();
  const jid = id ? Number(id) : NaN;
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const nav = useNavigate();
  const qc = useQueryClient();
  const can = usePermission('accounting', 'create');
  const { data: je } = useQuery({
    ...journalDetailQueryOptions(jid),
    enabled: !Number.isNaN(jid),
  });
  const [reason, setReason] = useState('');
  const [revDate, setRevDate] = useState(() => utcCalendarDayKey(now()));

  const m = useMutation({
    mutationFn: () =>
      reverseJournalEntry(jid, {
        reason: reason || null,
        reversal_date: revDate,
      }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: accountingKeys.root });
      toast.success(t('reversal.ok'));
      void nav(`/accounting/journal/${r.journal_entry_id}`);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  if (!can) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('errors.forbidden')}{' '}
        <Link className="underline" to={`/accounting/journal/${jid}`}>
          {t('journal.back')}
        </Link>
      </div>
    );
  }
  if (!je) return <div className="p-4">…</div>;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('reversal.title', { id: je.id })}</h1>
      <p className="text-sm text-muted-foreground">{je.description}</p>
      <div className="grid gap-1">
        <Label>{t('reversal.posting_date')}</Label>
        <DateField value={revDate} onChange={setRevDate} />
      </div>
      <div className="grid gap-1">
        <Label>{t('reversal.reason')}</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={m.isPending} onClick={() => void m.mutate()}>
          {t('reversal.submit')}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to={`/accounting/journal/${je.id}`}>{tc('actions.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}
