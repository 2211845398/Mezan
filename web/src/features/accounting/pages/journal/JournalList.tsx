import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateField } from '@/components/shared/form/DateField';
import { CreateButton,PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
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
import { usePermission } from '@/hooks/usePermission';
import { now, utcCalendarDayKey } from '@/lib/date';

import type { JournalEntryListItemRead } from '../../api';
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
  const [branch, setBranch] = useState('__all');
  const [source, setSource] = useState('');
  const [page] = useState(0);
  const pageSize = 30;
  const canCreate = usePermission('accounting', 'create');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const b =
    branch === '__all'
      ? undefined
      : Number(branch) || undefined;
  const listArgs = useMemo(() => {
    const p: {
      date_from: string;
      date_to: string;
      page: number;
      pageSize: number;
      branch_id?: number;
      source_type?: string;
    } = { date_from: dateFrom, date_to: dateTo, page, pageSize };
    if (b !== undefined) p.branch_id = b;
    const st = source.trim();
    if (st) p.source_type = st;
    return p;
  }, [dateFrom, dateTo, b, source, page, pageSize]);
  const { data, isLoading, isError, refetch } = useQuery(
    journalListQueryOptions(listArgs),
  );
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo(
    () =>
      defineColumns<JournalEntryListItemRead>()([
        { id: 'id', header: t('journal.col.id'), cell: ({ row }) => String(row.original.id) },
        {
          id: 'date',
          header: t('journal.col.date'),
          cell: ({ row }) => String(row.original.entry_date),
        },
        { id: 'source', header: t('journal.col.source'), cell: ({ row }) => row.original.source_type },
        { id: 'memo', header: t('journal.col.memo'), cell: ({ row }) => row.original.description },
        {
          id: 'dr',
          header: t('journal.col.debit'),
          cell: ({ row }) => String(row.original.total_debit),
        },
        {
          id: 'cr',
          header: t('journal.col.credit'),
          cell: ({ row }) => String(row.original.total_credit),
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
          <DateField value={dateFrom} onChange={setDateFrom} />
        </div>
        <div className="grid gap-1">
          <Label>{t('period.to')}</Label>
          <DateField value={dateTo} onChange={setDateTo} />
        </div>
        <div className="grid gap-1">
          <Label>{t('journal.filter.source_prefix')}</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} className="w-[200px]" />
        </div>
        <div className="grid gap-1">
          <Label>{t('toolbar.branch')}</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('toolbar.all_branches')}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => void refetch()}>
          {t('toolbar.apply')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('journal.total_rows', { total })}
      </p>
      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
