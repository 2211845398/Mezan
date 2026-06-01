import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
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
import { getBranchLabel } from '@/features/admin/lib/branchLabels';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { JournalEntryDetailRead, ManualJournalUpdate } from '../../api';
import { updateJournalEntry } from '../../api';
import JournalLinesGrid, { type JournalGridLine } from '../../components/JournalLinesGrid';
import { buildLedgerDrillDownUrl } from '../../lib/ledgerDrillDownUrl';
import { accountingMoneyCell, accountingMoneyHead } from '../../lib/accountingTableClasses';
import { isBalanced } from '../../lib/journalLineBalance';
import { journalSourceLabel } from '../../lib/journalSourceLabel';
import { accountingKeys, journalDetailQueryOptions } from '../../queries';

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
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const canReverse = usePermission('accounting', 'create');
  const canUpdate = usePermission('accounting', 'update');
  const [editing, setEditing] = useState(false);
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

  const defaultBranchId = branches[0]?.id ?? 0;

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

  return (
    <div className="flex flex-col gap-6 p-6">
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
              <Button size="sm" asChild>
                <Link to={`/accounting/journal/${je.id}/reverse`}>{t('journal.reverse')}</Link>
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
                <DateField value={entryDate} onChange={setEntryDate} className="max-w-[200px]" />
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
                <span className="text-sm">{je.description}</span>
              )}
            </dd>
          </div>
          {!editing ? (
            <div className="grid gap-1 sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t('journal.source_ref')}</dt>
              <dd className="num-latin text-xs text-muted-foreground break-all">
                {je.source_id}
              </dd>
            </div>
          ) : null}
        </dl>
      </SectionCard>

      {editing ? (
        <>
          <JournalLinesGrid
            lines={lines}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
            defaultBranchId={defaultBranchId}
            onChange={setLines}
          />
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
        <SectionCard title={t('journal.lines_title')}>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('journal.line.account')}</TableHead>
                  <TableHead>{t('manual.subledger.entity')}</TableHead>
                  <TableHead>{t('journal.line.branch')}</TableHead>
                  <TableHead className={accountingMoneyHead}>{t('journal.col.debit')}</TableHead>
                  <TableHead className={accountingMoneyHead}>{t('journal.col.credit')}</TableHead>
                  <TableHead>{t('journal.line.memo')}</TableHead>
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
                  const entity =
                    ln.customer_id != null
                      ? `#${ln.customer_id}`
                      : ln.supplier_id != null
                        ? `#${ln.supplier_id}`
                        : ln.employee_id != null
                          ? `#${ln.employee_id}`
                          : '—';
                  return (
                    <TableRow key={ln.line_no}>
                      <TableCell>
                        <a
                          href={glHref}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {ln.code} {ln.name}
                        </a>
                      </TableCell>
                      <TableCell>{entity}</TableCell>
                      <TableCell>{getBranchLabel(branches, ln.branch_id) || ln.branch_id}</TableCell>
                      <TableCell className={cn(accountingMoneyCell)}>
                        {Number(ln.debit) !== 0 ? formatMoney(ln.debit) : ''}
                      </TableCell>
                      <TableCell className={cn(accountingMoneyCell)}>
                        {Number(ln.credit) !== 0 ? formatMoney(ln.credit) : ''}
                      </TableCell>
                      <TableCell>{ln.memo ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
