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
import { cn } from '@/lib/utils';

import { AccountingBranchFilter } from '../../components/AccountingBranchFilter';
import { JournalSourceTypeCombobox } from '../../components/JournalSourceTypeCombobox';
import type { JournalEntryListItemRead } from '../../api';
import { accountingMoneyCell, journalListCellWrap } from '../../lib/accountingTableClasses';
import { formatJournalEntryDescription } from '../../lib/journalEntryDescription';
import { journalSourceLabel } from '../../lib/journalSourceLabel';
import { journalPageShellClass } from '../../lib/journalPageLayout';
import { journalListQueryOptions } from '../../queries';

function defaultDateRange() {
  const to = now();
  const from = subDays(to, 30);
  return { from: utcCalendarDayKey(from), to: utcCalendarDayKey(to) };
}

export default function JournalList() {
  const { t, i18n } = useTranslation('accounting');
  const { from: df0, to: dt0 } = defaultDateRange();
  const [dateFrom, setDateFrom] = useState(df0);
  const [dateTo, setDateTo] = useState(dt0);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [source, setSource] = useState('__all__');
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
    if (source !== '__all__') p.source_type = source;
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
          size: 96,
          meta: { align: 'center' },
          header: t('journal.col.id'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, 'text-center')}>
              <Button variant="link" className="h-auto p-0 num-latin" asChild>
                <Link to={`/accounting/journal/${row.original.id}`}>
                  #{row.original.id}
                </Link>
              </Button>
            </span>
          ),
        },
        {
          id: 'date',
          size: 116,
          meta: { align: 'center' },
          header: t('journal.col.date'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, 'text-center num-latin')}>
              {String(row.original.entry_date).slice(0, 10)}
            </span>
          ),
        },
        {
          id: 'source',
          size: 148,
          meta: { align: 'start' },
          header: t('journal.col.source'),
          cell: ({ row }) => (
            <span className={journalListCellWrap}>
              {journalSourceLabel(t, row.original.source_type)}
            </span>
          ),
        },
        {
          id: 'memo',
          size: 360,
          meta: { align: 'start' },
          header: t('journal.col.memo'),
          cell: ({ row }) => {
            const label = formatJournalEntryDescription(
              {
                description: row.original.description,
                source_type: row.original.source_type,
                source_id: row.original.source_id,
              },
              t,
              i18n.language,
            );
            return (
              <span className={cn(journalListCellWrap, 'truncate')} dir="auto" title={label}>
                {label}
              </span>
            );
          },
        },
        {
          id: 'dr',
          size: 132,
          meta: { align: 'center' },
          header: t('journal.col.debit'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, accountingMoneyCell)}>
              {formatMoney(row.original.total_debit)}
            </span>
          ),
        },
        {
          id: 'cr',
          size: 132,
          meta: { align: 'center' },
          header: t('journal.col.credit'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, accountingMoneyCell)}>
              {formatMoney(row.original.total_credit)}
            </span>
          ),
        },
        {
          id: 'bal',
          size: 88,
          meta: { align: 'center' },
          header: t('journal.col.balanced'),
          cell: ({ row }) => {
            const dr = Number(row.original.total_debit);
            const cr = Number(row.original.total_credit);
            const ok = Math.abs(dr - cr) < 0.01;
            return (
              <span className={cn(journalListCellWrap, 'flex justify-center')}>
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
          size: 64,
          meta: { align: 'center' },
          header: '',
          enableHiding: false,
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, 'flex justify-center')}>
              <Button type="button" size="icon" variant="ghost" asChild>
                <Link to={`/accounting/journal/${row.original.id}`} aria-label={t('journal.view')}>
                  <Eye className="size-4" />
                </Link>
              </Button>
            </span>
          ),
        },
      ]),
    [t, i18n.language],
  );

  const isRtl = i18n.dir() === 'rtl';

  return (
    <div className={journalPageShellClass(isRtl)} dir={isRtl ? 'rtl' : 'ltr'}>
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
            showCode={false}
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
        tableDir={isRtl ? 'rtl' : 'ltr'}
        tableClassName="w-full table-fixed"
        initialDensity="normal"
      />
    </div>
  );
}
