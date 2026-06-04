import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { DateField } from '@/components/shared/form/DateField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import { resolveCoaDisplayName } from '../../lib/coaDisplayName';
import { balanceSheetQueryOptions, chartAccountsQueryOptions } from '../../queries';

type LineRow = { account_id: number; code: string; name: string; amount: string; depth?: number };

function IndentedLinesTable({
  title,
  rows,
  accountNameById,
}: {
  title: string;
  rows: LineRow[];
  accountNameById: Map<number, string>;
}) {
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
                    {accountNameById.get(r.account_id) ?? r.name}
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

export default function BalanceSheet() {
  const { t, i18n } = useTranslation('accounting');
  const navigate = useNavigate();
  const d0 = utcCalendarDayKey(now());
  const [asOf, setAsOf] = useState(d0);
  const [branch, setBranch] = useState('__all');
  const [applied, setApplied] = useState<{ as_of: string; branch_id?: number }>({ as_of: d0 });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: chartAccounts = [] } = useQuery(chartAccountsQueryOptions(false));
  const accountNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of chartAccounts) {
      m.set(a.id, resolveCoaDisplayName(a, i18n.language));
    }
    return m;
  }, [chartAccounts, i18n.language]);

  const { data, isLoading } = useQuery(balanceSheetQueryOptions(applied));

  const apply = () => {
    const b = branch === '__all' ? undefined : Number(branch);
    setApplied(
      b === undefined ? { as_of: asOf } : { as_of: asOf, branch_id: b },
    );
  };

  const imbalance = data ? Number(data.assets_minus_liabilities_equity ?? 0) : 0;
  const balanced = Math.abs(imbalance) < 0.01;

  if (isLoading && !data) return <div className="p-4 text-muted-foreground">…</div>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('bs.title')} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('bs.as_of')}</Label>
          <DateField value={asOf} onChange={setAsOf} />
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
        <Button type="button" onClick={apply}>
          {t('toolbar.apply')}
        </Button>
      </div>

      {data ? (
        <div className="space-y-6">
          {/* KPI metric tiles */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">{t('bs.total_assets')}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums num-latin">
                {formatMoney(data.total_assets)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">{t('bs.total_liabilities')}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums num-latin">
                {formatMoney(data.total_liabilities)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">{t('bs.total_equity')}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums num-latin">
                {formatMoney(data.total_equity)}
              </p>
            </div>
            <div
              role={balanced ? undefined : 'button'}
              tabIndex={balanced ? undefined : 0}
              className={cn(
                'rounded-lg border p-4 text-start',
                balanced
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'cursor-pointer border-destructive/40 bg-destructive/10 transition-colors hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              onClick={
                balanced
                  ? undefined
                  : () => {
                      const qs = new URLSearchParams({ as_of: applied.as_of });
                      if (applied.branch_id != null) {
                        qs.set('branch_id', String(applied.branch_id));
                      } else {
                        qs.set('branch_id', '__all');
                      }
                      navigate(`/accounting/balance-diagnostics?${qs.toString()}`);
                    }
              }
              onKeyDown={
                balanced
                  ? undefined
                  : (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as HTMLDivElement).click();
                      }
                    }
              }
            >
              <p className={cn('text-xs', balanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive')}>
                {t('bs.balance_check')}
              </p>
              {balanced ? (
                <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                  ✓ {t('bs.balanced')}
                </p>
              ) : (
                <p className="mt-1 text-lg font-semibold text-destructive">
                  ⚠ {t('bs.difference')}: {formatMoney(imbalance)}
                </p>
              )}
            </div>
          </div>

          <IndentedLinesTable
            title={t('bs.section.assets')}
            rows={data.asset_lines ?? []}
            accountNameById={accountNameById}
          />
          <IndentedLinesTable
            title={t('bs.section.liabilities')}
            rows={data.liability_lines ?? []}
            accountNameById={accountNameById}
          />
          <IndentedLinesTable
            title={t('bs.section.equity')}
            rows={data.equity_lines ?? []}
            accountNameById={accountNameById}
          />
        </div>
      ) : null}
    </div>
  );
}
