import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { now, utcCalendarDayKey } from '@/lib/date';
import { newIdempotencyKey } from '@/lib/idempotency';

import { createManualJournal, type ManualJournalCreate } from '../../api';
import JournalLinesGrid, { type JournalGridLine } from '../../components/JournalLinesGrid';
import { isBalanced } from '../../lib/journalLineBalance';
import { journalPageShellClass } from '../../lib/journalPageLayout';
import { accountingKeys } from '../../queries';

function newLine(branchId: number): JournalGridLine {
  return {
    key: crypto.randomUUID(),
    account_id: 0,
    subledger_kind: 'none',
    branch_id: branchId,
    debit: '0',
    credit: '0',
    memo: '',
    customer_id: null,
    supplier_id: null,
    employee_id: null,
  };
}

export default function ManualJournalForm() {
  const { t, i18n } = useTranslation('accounting');
  const isRtl = i18n.dir() === 'rtl';
  const { t: tc } = useTranslation('common');
  const nav = useNavigate();
  const qc = useQueryClient();
  const can = usePermission('accounting', 'create');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const defaultBranchId = branches[0]?.id ?? 0;
  const [entryDate, setEntryDate] = useState(() => utcCalendarDayKey(now()));
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalGridLine[]>(() => [
    newLine(defaultBranchId),
    newLine(defaultBranchId),
  ]);

  const linesValid = useMemo(
    () =>
      lines.every((ln) => {
        if (!ln.account_id || !ln.branch_id) return false;
        if (ln.subledger_kind === 'customer' && !ln.customer_id) return false;
        if (ln.subledger_kind === 'supplier' && !ln.supplier_id) return false;
        if (ln.subledger_kind === 'employee' && !ln.employee_id) return false;
        const dr = Number(ln.debit);
        const cr = Number(ln.credit);
        return (dr > 0) !== (cr > 0);
      }),
    [lines],
  );

  const canSubmit = isBalanced(lines) && lines.length >= 2 && linesValid && description.trim().length > 0;

  const m = useMutation({
    mutationFn: async (body: ManualJournalCreate) => {
      const key = newIdempotencyKey();
      return createManualJournal(body, key);
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: accountingKeys.root });
      toast.success(t('manual.saved'));
      void nav(`/accounting/journal/${r.id}`);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  if (!can) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('errors.forbidden')}{' '}
        <Link className="underline" to="/accounting/journal">
          {t('journal.back')}
        </Link>
      </div>
    );
  }

  return (
    <div className={journalPageShellClass(isRtl)} dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader title={t('manual.title')} />
      <SectionCard contentClassName="p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-end">
          <div className="grid gap-1">
            <Label>{t('manual.entry_date')}</Label>
            <DateField
              value={entryDate}
              onChange={setEntryDate}
              inputDir={isRtl ? 'rtl' : 'ltr'}
              rtlLayout={isRtl}
              className="w-full max-w-xs"
            />
          </div>
          <div className="grid min-w-0 gap-1">
            <Label>{t('manual.description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('journal.lines_title')} contentClassName="p-4 sm:p-6">
        <JournalLinesGrid
          lines={lines}
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          defaultBranchId={defaultBranchId}
          onChange={setLines}
        />
      </SectionCard>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!canSubmit || m.isPending}
          onClick={() => {
            m.mutate({
              entry_date: entryDate,
              description: description.trim(),
              lines: lines.map((ln) => ({
                account_id: ln.account_id,
                branch_id: ln.branch_id,
                debit: ln.debit,
                credit: ln.credit,
                memo: ln.memo || null,
                customer_id: ln.customer_id,
                supplier_id: ln.supplier_id,
                employee_id: ln.employee_id,
              })),
            });
          }}
        >
          {t('manual.submit')}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/accounting/journal">{tc('actions.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}
