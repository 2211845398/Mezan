import { useQuery } from '@tanstack/react-query';
import { startOfMonth } from 'date-fns';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/form/DateField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import { AccountingBranchFilter } from '../../components/AccountingBranchFilter';
import { incomeStatementQueryOptions } from '../../queries';

type LineRow = { account_id: number; code: string; name: string; amount: string; depth?: number };

function IndentedLinesTable({ title, rows }: { title: string; rows: LineRow[] }) {
  const { t } = useTranslation('accounting');
  return (
    <div>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('tb.col.code')}</TableHead>
              <TableHead>{t('tb.col.name')}</TableHead>
              <TableHead className="text-end">{t('is.amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const depth = r.depth ?? (r.code ? (r.code.split('.').length - 1) : 0);
              return (
                <TableRow key={r.account_id}>
                  <TableCell
                    className={cn('num-latin text-sm', depth === 0 && 'font-medium', depth >= 2 && 'text-muted-foreground')}
                    style={{ paddingInlineStart: `${12 + depth * 16}px` }}
                  >
                    {r.code}
                  </TableCell>
                  <TableCell
                    className={cn('text-sm', depth === 0 && 'font-medium', depth >= 2 && 'text-muted-foreground')}
                    style={{ paddingInlineStart: `${12 + depth * 16}px` }}
                  >
                    {r.name}
                  </TableCell>
                  <TableCell className="text-end tabular-nums num-latin text-sm">
                    {formatMoney(r.amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function defaultIsPeriod() {
  return {
    ps: utcCalendarDayKey(startOfMonth(now())),
    pe: utcCalendarDayKey(now()),
  };
}

export default function IncomeStatement() {
  const { t } = useTranslation('accounting');
  const d0 = defaultIsPeriod();
  const [ps, setPs] = useState(d0.ps);
  const [pe, setPe] = useState(d0.pe);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [applied, setApplied] = useState<{
    period_start: string;
    period_end: string;
    branch_id?: number;
  }>({ period_start: d0.ps, period_end: d0.pe });
  const { data, isLoading } = useQuery(incomeStatementQueryOptions(applied));

  const apply = () => {
    setApplied(
      branchId == null
        ? { period_start: ps, period_end: pe }
        : { period_start: ps, period_end: pe, branch_id: branchId },
    );
  };

  const netIncome = data ? Number(data.net_income ?? 0) : 0;
  const netPositive = netIncome >= 0;

  if (isLoading && !data) return <div className="p-4 text-muted-foreground">…</div>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('is.title')} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('is.period_start')}</Label>
          <DateField value={ps} onChange={setPs} className="w-[200px]" />
        </div>
        <div className="grid gap-1">
          <Label>{t('is.period_end')}</Label>
          <DateField value={pe} onChange={setPe} className="w-[200px]" />
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
        <Button type="button" onClick={apply}>
          {t('toolbar.apply')}
        </Button>
      </div>

      {data ? (
        <div className="space-y-6">
          {/* KPI metric tiles */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-muted bg-muted/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">{t('is.revenue')}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums num-latin text-foreground">
                {formatMoney(data.total_revenue)}
              </p>
            </div>
            <div className="rounded-lg border border-muted bg-muted/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">{t('is.expense')}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums num-latin text-foreground">
                {formatMoney(data.total_expense)}
              </p>
            </div>
            <div className={cn('rounded-lg border p-4', netPositive ? 'border-emerald-400/40 bg-emerald-50/40 dark:bg-emerald-900/10' : 'border-destructive/40 bg-destructive/10')}>
              <p className={cn('text-xs font-medium', netPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive')}>
                {t('is.net_income')}
              </p>
              <p className={cn('mt-1 text-xl font-semibold tabular-nums num-latin', netPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive')}>
                {formatMoney(data.net_income)}
              </p>
            </div>
          </div>

          <IndentedLinesTable title={t('is.revenue_lines')} rows={data.revenue_lines ?? []} />
          <IndentedLinesTable title={t('is.expense_lines')} rows={data.expense_lines ?? []} />
        </div>
      ) : null}
    </div>
  );
}
