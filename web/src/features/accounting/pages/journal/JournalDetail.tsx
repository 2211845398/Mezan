import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { JournalEntryDetailRead, ManualJournalUpdate } from '../../api';
import { updateJournalEntry } from '../../api';
import JournalLinesGrid, { type JournalGridLine } from '../../components/JournalLinesGrid';
import { JournalReversalDialog } from '../../components/JournalReversalDialog';
import { buildLedgerDrillDownUrl } from '../../lib/ledgerDrillDownUrl';
import {
  journalLineCell,
  journalLineHead,
  journalLineMoneyCell,
  journalLineMoneyHead,
} from '../../lib/accountingTableClasses';
import { resolveCoaDisplayName } from '../../lib/coaDisplayName';
import { isBalanced } from '../../lib/journalLineBalance';
import { formatJournalEntryDescription } from '../../lib/journalEntryDescription';
import { journalPageShellClass } from '../../lib/journalPageLayout';
import { journalSourceLabel } from '../../lib/journalSourceLabel';
import {
  accountingKeys,
  journalDetailQueryOptions,
  postableAccountsQueryOptions,
} from '../../queries';

function linesFromDetail(je: JournalEntryDetailRead): JournalGridLine[] {
  return je.lines.map((ln) => ({
    key: `ln-${ln.line_no}`,
    account_id: ln.account_id,
    subledger_kind: (ln.subledger_kind as JournalGridLine['subledger_kind']) ?? 'none',
    branch_id: ln.branch_id,
    debit: String(ln.debit),
    credit: String(ln.credit),
    memo: ln.memo ?? '',
    customer_id: ln.customer_id ?? null,
    supplier_id: ln.supplier_id ?? null,
    employee_id: ln.employee_id ?? null,
  }));
}

export default function JournalDetail() {
  const { id } = useParams<{ id: string }>();
  const jid = id ? Number(id) : NaN;
  const { t, i18n } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const nav = useNavigate();
  const location = useLocation();
  const isRtl = i18n.dir() === 'rtl';
  const qc = useQueryClient();
  const canReverse = usePermission('accounting', 'create');
  const canUpdate = usePermission('accounting', 'update');
  const [editing, setEditing] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [entryDate, setEntryDate] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalGridLine[]>([]);

  const { data: je, isLoading } = useQuery({
    ...journalDetailQueryOptions(jid),
    enabled: !Number.isNaN(jid),
  });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: postableAccounts = [] } = useQuery(postableAccountsQueryOptions());

  const accountDisplayById = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of postableAccounts) {
      m.set(a.id, resolveCoaDisplayName(a, i18n.language));
    }
    return m;
  }, [postableAccounts, i18n.language]);

  const defaultBranchId = branches[0]?.id ?? 0;

  useEffect(() => {
    const state = location.state as { openReverse?: boolean } | null;
    if (state?.openReverse) {
      setReverseOpen(true);
      void nav(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, nav]);

  const startEdit = () => {
    if (!je) return;
    setEntryDate(String(je.entry_date).slice(0, 10));
    setDescription(je.description);
    setLines(linesFromDetail(je));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveM = useMutation({
    mutationFn: (body: ManualJournalUpdate) => updateJournalEntry(jid, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountingKeys.root });
      toast.success(t('journal.edit_saved'));
      setEditing(false);
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

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

  const canSave =
    editing &&
    isBalanced(lines) &&
    lines.length >= 2 &&
    linesValid &&
    description.trim().length > 0 &&
    entryDate.length > 0;

  if (Number.isNaN(jid)) return null;
  if (isLoading || !je) return <div className="p-4">…</div>;

  const canShowReverse =
    canReverse && !je.reversed_by_entry_id && je.source_type !== 'journal_reversal';
  const canEdit = canUpdate && !je.reversed_by_entry_id && je.source_type !== 'journal_reversal';
  const sourceLabel = journalSourceLabel(t, je.source_type);
  const entryDescription = formatJournalEntryDescription(
    { description: je.description, source_type: je.source_type, source_id: je.source_id },
    t,
    i18n.language,
  );

  return (
    <div className={journalPageShellClass(isRtl)} dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('journal.detail_title', { id: je.id })}
        actions={
          <div className="flex flex-wrap gap-2">
            {je.reverses_entry_id ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/accounting/journal/${je.reverses_entry_id}`}>
                  {t('journal.link_original', { id: je.reverses_entry_id })}
                </Link>
              </Button>
            ) : null}
            {je.reversed_by_entry_id ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/accounting/journal/${je.reversed_by_entry_id}`}>
                  {t('journal.link_reversal', { id: je.reversed_by_entry_id })}
                </Link>
              </Button>
            ) : null}
            {canEdit && !editing ? (
              <Button type="button" size="sm" onClick={startEdit}>
                {t('journal.edit')}
              </Button>
            ) : null}
            {canShowReverse ? (
              <Button type="button" size="sm" onClick={() => setReverseOpen(true)}>
                {t('journal.reverse')}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link to="/accounting/journal">{t('journal.list_title')}</Link>
            </Button>
          </div>
        }
      />

      {je.source_type !== 'manual' && editing ? (
        <Alert variant="destructive">
          <AlertDescription>{t('journal.edit_system_warning')}</AlertDescription>
        </Alert>
      ) : null}

      <SectionCard title={t('journal.detail_meta')}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">{t('journal.col.date')}</dt>
            <dd>
              {editing ? (
                <DateField
                  value={entryDate}
                  onChange={setEntryDate}
                  className="max-w-[200px]"
                  inputDir={isRtl ? 'rtl' : 'ltr'}
                  rtlLayout={isRtl}
                />
              ) : (
                <span className="num-latin text-sm">{String(je.entry_date).slice(0, 10)}</span>
              )}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">{t('journal.col.source')}</dt>
            <dd className="text-sm">{sourceLabel}</dd>
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{t('journal.col.memo')}</dt>
            <dd>
              {editing ? (
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              ) : (
                <span className="text-sm" dir="auto">
                  {entryDescription}
                </span>
              )}
            </dd>
          </div>
          {!editing && je.source_reference ? (
            <div className="grid gap-1 sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t('journal.source_ref')}</dt>
              <dd className="text-sm" dir="auto">
                {je.source_reference}
              </dd>
            </div>
          ) : null}
        </dl>
      </SectionCard>

      {editing ? (
        <>
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
              disabled={!canSave || saveM.isPending}
              onClick={() => {
                saveM.mutate({
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
              {t('journal.save')}
            </Button>
            <Button type="button" variant="outline" onClick={cancelEdit}>
              {tc('actions.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <SectionCard title={t('journal.lines_title')} contentClassName="p-4 sm:p-6">
          <div className="w-full min-w-0 overflow-x-auto rounded-lg border" dir={isRtl ? 'rtl' : 'ltr'}>
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className={journalLineHead}>{t('journal.line.account')}</TableHead>
                  <TableHead className={journalLineHead}>{t('manual.subledger.entity')}</TableHead>
                  <TableHead className={journalLineHead}>{t('journal.line.branch')}</TableHead>
                  <TableHead className={journalLineMoneyHead}>{t('journal.col.debit')}</TableHead>
                  <TableHead className={journalLineMoneyHead}>{t('journal.col.credit')}</TableHead>
                  <TableHead className={journalLineHead}>{t('journal.line.memo')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {je.lines.map((ln) => {
                  const glHref = buildLedgerDrillDownUrl({
                    account_id: ln.account_id,
                    date_from: String(je.entry_date).slice(0, 10),
                    date_to: String(je.entry_date).slice(0, 10),
                    customer_id: ln.customer_id ?? undefined,
                    supplier_id: ln.supplier_id ?? undefined,
                    employee_id: ln.employee_id ?? undefined,
                  });
                  const accountName =
                    accountDisplayById.get(ln.account_id) ?? ln.name;
                  const hasEntity =
                    ln.customer_id != null ||
                    ln.supplier_id != null ||
                    ln.employee_id != null;
                  const entity = hasEntity ? (ln.subledger_entity_name ?? '—') : '—';
                  const branch =
                    branches.find((b) => b.id === ln.branch_id)?.name ??
                    String(ln.branch_id);
                  return (
                    <TableRow key={ln.line_no}>
                      <TableCell className={journalLineCell}>
                        <Link
                          to={glHref}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {ln.code} {accountName}
                        </Link>
                      </TableCell>
                      <TableCell className={journalLineCell}>{entity}</TableCell>
                      <TableCell className={journalLineCell}>{branch}</TableCell>
                      <TableCell className={cn(journalLineMoneyCell)}>
                        {Number(ln.debit) !== 0 ? formatMoney(ln.debit) : ''}
                      </TableCell>
                      <TableCell className={cn(journalLineMoneyCell)}>
                        {Number(ln.credit) !== 0 ? formatMoney(ln.credit) : ''}
                      </TableCell>
                      <TableCell className={journalLineCell}>{ln.memo ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      {canShowReverse && je ? (
        <JournalReversalDialog
          open={reverseOpen}
          onOpenChange={setReverseOpen}
          journalEntry={je}
          onReversed={(reversalId) => {
            void nav(`/accounting/journal/${reversalId}`);
          }}
        />
      ) : null}
    </div>
  );
}
