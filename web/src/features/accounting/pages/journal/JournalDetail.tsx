import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';

import { journalDetailQueryOptions } from '../../queries';

export default function JournalDetail() {
  const { id } = useParams<{ id: string }>();
  const jid = id ? Number(id) : NaN;
  const { t } = useTranslation('accounting');
  const canReverse = usePermission('accounting', 'create');
  const { data: je, isLoading, refetch } = useQuery({
    ...journalDetailQueryOptions(jid),
    enabled: !Number.isNaN(jid),
  });

  if (Number.isNaN(jid)) return null;
  if (isLoading || !je) return <div className="p-4">…</div>;

  const canShowReverse =
    canReverse && !je.reversed_by_entry_id && je.source_type !== 'journal_reversal';

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {t('journal.detail_title', { id: je.id })}
        </h1>
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
          {canShowReverse ? (
            <Button asChild>
              <Link to={`/accounting/journal/${je.id}/reverse`}>{t('journal.reverse')}</Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link to="/accounting/journal">{t('journal.list_title')}</Link>
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {je.entry_date} · {je.source_type} / {je.source_id}
      </p>
      <p>{je.description}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('journal.line.account')}</TableHead>
            <TableHead>{t('journal.line.branch')}</TableHead>
            <TableHead>{t('journal.col.debit')}</TableHead>
            <TableHead>{t('journal.col.credit')}</TableHead>
            <TableHead>{t('journal.line.memo')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {je.lines.map((ln) => (
            <TableRow key={ln.line_no}>
              <TableCell>
                {ln.code} {ln.name}
              </TableCell>
              <TableCell>{ln.branch_id}</TableCell>
              <TableCell>{String(ln.debit)}</TableCell>
              <TableCell>{String(ln.credit)}</TableCell>
              <TableCell>{ln.memo ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button type="button" variant="ghost" onClick={() => void refetch()}>
        {t('toolbar.apply')}
      </Button>
    </div>
  );
}
