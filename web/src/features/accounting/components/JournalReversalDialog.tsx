import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import {
  floatingFormApproveButtonClassName,
  floatingFormCloseButtonClassName,
} from '@/components/shared/FloatingFormDialog/styles';
import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { now, utcCalendarDayKey } from '@/lib/date';

import type { JournalEntryDetailRead } from '../api';
import { reverseJournalEntry } from '../api';
import { formatJournalEntryDescription } from '../lib/journalEntryDescription';
import { accountingKeys } from '../queries';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journalEntry: JournalEntryDetailRead;
  onReversed: (reversalEntryId: number) => void;
};

export function JournalReversalDialog({
  open,
  onOpenChange,
  journalEntry,
  onReversed,
}: Props) {
  const { t, i18n } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const isRtl = i18n.dir() === 'rtl';
  const entryDescription = formatJournalEntryDescription(
    {
      description: journalEntry.description,
      source_type: journalEntry.source_type,
      source_id: journalEntry.source_id,
    },
    t,
    i18n.language,
  );
  const [reason, setReason] = useState('');
  const [revDate, setRevDate] = useState(() => utcCalendarDayKey(now()));

  useEffect(() => {
    if (open) {
      setReason('');
      setRevDate(utcCalendarDayKey(now()));
    }
  }, [open]);

  const m = useMutation({
    mutationFn: () =>
      reverseJournalEntry(journalEntry.id, {
        reason: reason || null,
        reversal_date: revDate,
      }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: accountingKeys.root });
      toast.success(t('reversal.ok'));
      onOpenChange(false);
      onReversed(r.journal_entry_id);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  return (
    <FloatingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('reversal.title', { id: journalEntry.id })}
      description={entryDescription}
      maxWidth="md"
      footer={
        <>
          <Button
            type="button"
            disabled={m.isPending || revDate.length === 0}
            className={floatingFormApproveButtonClassName}
            onClick={() => void m.mutate()}
          >
            {t('reversal.submit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={m.isPending}
            className={floatingFormCloseButtonClassName}
            onClick={() => onOpenChange(false)}
          >
            {tc('actions.cancel')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1">
          <Label>{t('reversal.posting_date')}</Label>
          <DateField
            value={revDate}
            onChange={setRevDate}
            inputDir={isRtl ? 'rtl' : 'ltr'}
            rtlLayout={isRtl}
          />
        </div>
        <div className="grid gap-1">
          <Label>{t('reversal.reason')}</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
        </div>
      </div>
    </FloatingFormDialog>
  );
}
