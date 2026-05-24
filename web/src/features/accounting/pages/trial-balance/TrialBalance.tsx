import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
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
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { usePermission } from '@/hooks/usePermission';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { TrialBalanceRow } from '../../api';
import { exportTrialBalanceCsvBlob } from '../../api';
import { buildLedgerDrillDownUrl } from '../../lib/ledgerDrillDownUrl';
import { trialBalanceQueryOptions } from '../../queries';

export default function TrialBalance() {
  const { t } = useTranslation('accounting');
  const t0 = utcCalendarDayKey(now());
  const [asOf, setAsOf] = useState(t0);
  const [branch, setBranch] = useState('__all');
  const [applied, setApplied] = useState<{ as_of: string; branch_id?: number }>({ as_of: t0 });
  const canExport = usePermission('accounting', 'read');
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: rows = [], isLoading, isError, refetch } = useQuery(
    trialBalanceQueryOptions(applied),
  );

  const totals = useMemo(() => {
    let dr = 0;
    let cr = 0;
    for (const r of rows) {
      dr += Number(r.total_debit);
      cr += Number(r.total_credit);
    }
    const diff = Math.abs(dr - cr);
    const balanced = diff < 0.01;
    return { dr, cr, balanced };
  }, [rows]);

  const apply = () => {
    const b = branch === '__all' ? undefined : Number(branch);
    setApplied(
      b === undefined ? { as_of: asOf } : { as_of: asOf, branch_id: b },
    );
  };

  const exportCsv = async () => {
    const b = branch === '__all' ? undefined : Number(branch);
    const blob = await exportTrialBalanceCsvBlob(
      b === undefined
        ? { as_of: applied.as_of }
        : { as_of: applied.as_of, branch_id: b },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trial_balance.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo(
    () =>
      defineColumns<TrialBalanceRow>()([
        { id: 'code', accessorKey: 'code', header: t('tb.col.code') },
        {
          id: 'name',
          header: t('tb.col.name'),
          cell: ({ row }) => {
            const href = buildLedgerDrillDownUrl({
              account_id: row.original.account_id,
              date_from: `${applied.as_of.slice(0, 4)}-01-01`,
              date_to: applied.as_of,
              branch_id: applied.branch_id,
            });
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {row.original.name}
              </a>
            );
          },
        },
        { id: 'type', accessorKey: 'account_type', header: t('tb.col.type') },
        {
          id: 'dr',
          header: t('tb.col.debit'),
          cell: ({ row }) => (
            <span className="block text-end tabular-nums num-latin">
              {Number(row.original.total_debit) !== 0 ? formatMoney(row.original.total_debit) : ''}
            </span>
          ),
        },
        {
          id: 'cr',
          header: t('tb.col.credit'),
          cell: ({ row }) => (
            <span className="block text-end tabular-nums num-latin">
              {Number(row.original.total_credit) !== 0 ? formatMoney(row.original.total_credit) : ''}
            </span>
          ),
        },
        {
          id: 'net',
          header: t('tb.col.net'),
          cell: ({ row }) => (
            <span className={cn('block text-end tabular-nums num-latin',
              Number(row.original.net) !== 0 && 'font-medium',
            )}>
              {formatMoney(row.original.net)}
            </span>
          ),
        },
      ]),
    [t, applied],
  );

  // Highlight rows with non-zero net (active accounts)
  const getRowClassName = (row: TrialBalanceRow) =>
    Number(row.net) !== 0 ? 'bg-amber-50/40 dark:bg-amber-900/10' : undefined;

  const balancedBadge = rows.length > 0 ? (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ms-2',
        totals.balanced
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
          : 'border-destructive/40 bg-destructive/10 text-destructive',
      )}
    >
      {totals.balanced ? `✓ ${t('tb.balanced')}` : `⚠ ${t('tb.unbalanced')}`}
    </span>
  ) : null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title={<span className="flex items-center">{t('tb.title')}{balancedBadge}</span>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('tb.as_of')}</Label>
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
        {canExport ? (
          <Button type="button" variant="outline" onClick={() => void exportCsv()}>
            {t('tb.export')}
          </Button>
        ) : null}
      </div>

      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        getRowClassName={getRowClassName}
      />

      {/* Totals footer row */}
      {rows.length > 0 ? (
        <div className="rounded-lg border bg-muted/30 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={3}>{t('tb.totals_row')}</TableHead>
                <TableHead className="text-end">{formatMoney(totals.dr)}</TableHead>
                <TableHead className="text-end">{formatMoney(totals.cr)}</TableHead>
                <TableHead className={cn('text-end', !totals.balanced && 'text-destructive font-semibold')}>
                  {formatMoney(Math.abs(totals.dr - totals.cr))}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody />
          </Table>
        </div>
      ) : null}
    </div>
  );
}
