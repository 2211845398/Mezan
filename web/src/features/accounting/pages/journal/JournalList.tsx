import { useQuery } from '@tanstack/react-query';

import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import { subDays } from 'date-fns';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateField } from '@/components/shared/form/DateField';
import { CreateButton, PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';

import { AccountingBranchFilter } from '../../components/AccountingBranchFilter';
import { JournalSourceTypeCombobox } from '../../components/JournalSourceTypeCombobox';
import type { JournalEntryListItemRead } from '../../api';
import { accountingMoneyCell, accountingMoneyHead } from '../../lib/accountingTableClasses';
import { journalSourceLabel } from '../../lib/journalSourceLabel';
import { journalListQueryOptions } from '../../queries';

function defaultDateRange() {
  const to = now();
  const from = subDays(to, 30);
  return { from: utcCalendarDayKey(from), to: utcCalendarDayKey(to) };
}

export default function JournalList() {
  const { t } = useTranslation('accounting');
  const { from: df0, to: dt0 } = defaultDateRange();
  const [dateFrom, setDateFrom] = useState(df0);
  const [dateTo, setDateTo] = useState(dt0);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [source, setSource] = useState('__all');
  const [urlQuery] = useTableUrlState({ pageSize: 30 });
  const page = urlQuery.page - 1;
  const pageSize = urlQuery.pageSize;
  const canCreate = usePermission('accounting', 'create');

  const listArgs = useMemo(() => {
    const p: {
      date_from: string;
      date_to: string;
      page: number;
      pageSize: number;
      branch_id?: number;
      source_type?: string;
    } = { date_from: dateFrom, date_to: dateTo, page, pageSize };
    if (branchId != null) p.branch_id = branchId;
    if (source !== '__all') p.source_type = source;
    return p;
  }, [dateFrom, dateTo, branchId, source, page, pageSize]);

  const { data, isLoading, isError, refetch } = useQuery(
    journalListQueryOptions(listArgs),
  );
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo(
    () =>
      defineColumns<JournalEntryListItemRead>()([
        {
          id: 'id',
          header: t('journal.col.id'),
          cell: ({ row }) => (
            <Button variant="link" className="h-auto p-0 num-latin" asChild>
              <Link to={`/accounting/journal/${row.original.id}`}>
                #{row.original.id}
              </Link>
            </Button>
          ),
        },
        {
          id: 'date',
          header: t('journal.col.date'),
          cell: ({ row }) => String(row.original.entry_date).slice(0, 10),
        },
        {
          id: 'source',
          header: t('journal.col.source'),
          cell: ({ row }) => journalSourceLabel(t, row.original.source_type),
        },
        { id: 'memo', header: t('journal.col.memo'), cell: ({ row }) => row.original.description },
        {
          id: 'dr',
          header: () => <span className={accountingMoneyHead}>{t('journal.col.debit')}</span>,
          cell: ({ row }) => (
            <span className={accountingMoneyCell}>{formatMoney(row.original.total_debit)}</span>
          ),
        },
        {
          id: 'cr',
          header: () => <span className={accountingMoneyHead}>{t('journal.col.credit')}</span>,
          cell: ({ row }) => (
            <span className={accountingMoneyCell}>{formatMoney(row.original.total_credit)}</span>
          ),
        },
        {
          id: 'bal',
          header: () => <span className={accountingMoneyHead}>{t('journal.col.balanced')}</span>,
          cell: ({ row }) => {
            const dr = Number(row.original.total_debit);
            const cr = Number(row.original.total_credit);
            const ok = Math.abs(dr - cr) < 0.01;
            return (
              <span className="flex justify-center">
                {ok ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-label="balanced" />
                ) : (
                  <XCircle className="size-4 text-destructive" aria-label="unbalanced" />
                )}
              </span>
            );
          },
        },
        {
          id: 'a',
          header: '',
          cell: ({ row }) => (
            <Button type="button" size="icon" variant="ghost" asChild>
              <Link to={`/accounting/journal/${row.original.id}`} aria-label={t('journal.view')}>
                <Eye className="size-4" />
              </Link>
            </Button>
          ),
        },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('journal.list_title')}
        actions={
          <CreateButton
            to="/accounting/journal/new"
            label={t('journal.new_manual')}
            visible={canCreate}
          />
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('period.from')}</Label>
          <DateField value={dateFrom} onChange={setDateFrom} className="w-[180px]" />
        </div>
        <div className="grid gap-1">
          <Label>{t('period.to')}</Label>
          <DateField value={dateTo} onChange={setDateTo} className="w-[180px]" />
        </div>
        <div className="grid gap-1">
          <Label>{t('journal.filter.source_type')}</Label>
          <JournalSourceTypeCombobox
            value={source}
            onChange={setSource}
            allLabel={t('journal.filter.all_sources')}
          />
        </div>
        <div className="grid gap-1">
          <Label>{t('toolbar.branch')}</Label>
          <AccountingBranchFilter
            value={branchId}
            onChange={setBranchId}
            clearLabel={t('toolbar.all_branches')}
            className="w-[200px]"
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('journal.total_rows', { total })}
      </p>
      <DataTable
        mode="server"
        columns={columns}
        data={rows}
        totalRows={total}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
