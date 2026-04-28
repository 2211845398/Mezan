import { useQuery } from '@tanstack/react-query';
import { startOfMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
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
import { now, utcCalendarDayKey } from '@/lib/date';

import type { GeneralLedgerLineRead } from '../../api';
import AccountPicker from '../../components/AccountPicker';
import { runningBalancesForGlLines } from '../../lib/glRunningBalance';
import { generalLedgerQueryOptions } from '../../queries';

export default function GeneralLedger() {
  const { t } = useTranslation('accounting');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [df, setDf] = useState(() => utcCalendarDayKey(startOfMonth(now())));
  const [dt, setDt] = useState(() => utcCalendarDayKey(now()));
  const [branch, setBranch] = useState('__all');
  const [applied, setApplied] = useState<{
    account_id: number;
    date_from: string;
    date_to: string;
    branch_id?: number;
  } | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const glQueryParams = useMemo(
    () =>
      applied
        ? (() => {
            const p: {
              account_id: number;
              date_from: string;
              date_to: string;
              branch_id?: number;
            } = {
              account_id: applied.account_id,
              date_from: applied.date_from,
              date_to: applied.date_to,
            };
            if (applied.branch_id !== undefined) p.branch_id = applied.branch_id;
            return p;
          })()
        : { account_id: 0, date_from: df, date_to: dt },
    [applied, df, dt],
  );

  const { data: lines = [], isLoading, isError, refetch } = useQuery({
    ...generalLedgerQueryOptions(glQueryParams),
    enabled: applied !== null,
  });

  const running = useMemo(() => runningBalancesForGlLines(lines), [lines]);

  const withRun = useMemo(
    () => lines.map((ln, i) => ({ ...ln, _run: running[i]! })),
    [lines, running],
  );

  const apply = () => {
    if (!accountId) return;
    const b = branch === '__all' ? undefined : Number(branch);
    setApplied(
      b === undefined
        ? { account_id: accountId, date_from: df, date_to: dt }
        : { account_id: accountId, date_from: df, date_to: dt, branch_id: b },
    );
  };

  const columns = useMemo(
    () =>
      defineColumns<GeneralLedgerLineRead & { _run: string }>()([
        {
          id: 'd',
          header: t('gl.col.date'),
          cell: ({ row }) => row.original.entry_date?.slice(0, 10),
        },
        { id: 'j', header: t('gl.col.je'), cell: ({ row }) => row.original.journal_entry_id },
        {
          id: 'desc',
          header: t('gl.col.desc'),
          cell: ({ row }) => (
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to={`/accounting/journal/${row.original.journal_entry_id}`}>
                {row.original.description}
              </Link>
            </Button>
          ),
        },
        { id: 'dr', header: t('journal.col.debit'), cell: ({ row }) => String(row.original.debit) },
        { id: 'cr', header: t('journal.col.credit'), cell: ({ row }) => String(row.original.credit) },
        { id: 'run', header: t('gl.col.balance'), cell: ({ row }) => row.original._run },
      ]),
    [t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t('gl.title')}</h1>
      <div className="grid max-w-md gap-1">
        <Label>{t('gl.account')}</Label>
        <AccountPicker value={accountId} onChange={setAccountId} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('period.from')}</Label>
          <DateField value={df} onChange={setDf} />
        </div>
        <div className="grid gap-1">
          <Label>{t('period.to')}</Label>
          <DateField value={dt} onChange={setDt} />
        </div>
        <div className="grid gap-1">
          <Label>{t('toolbar.branch')}</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-[200px]">
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
        <Button type="button" onClick={apply} disabled={!accountId}>
          {t('toolbar.apply')}
        </Button>
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={applied && accountId ? withRun : []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
