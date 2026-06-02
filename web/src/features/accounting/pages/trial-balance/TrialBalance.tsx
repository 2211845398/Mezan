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
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermission } from '@/hooks/usePermission';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import { AccountingBranchFilter } from '../../components/AccountingBranchFilter';
import type { TrialBalanceRow } from '../../api';
import { exportTrialBalanceCsvBlob, exportTrialBalancePdfBlob } from '../../api';
import {
  accountingMoneyCell,
  journalLineHead,
  journalLineMoneyHead,
  journalListCellWrap,
} from '../../lib/accountingTableClasses';
import { accountTypeLabel } from '../../lib/accountTypeLabel';
import { buildLedgerDrillDownUrl } from '../../lib/ledgerDrillDownUrl';
import { resolveCoaDisplayName } from '../../lib/coaDisplayName';
import { journalPageShellClass } from '../../lib/journalPageLayout';
import { chartAccountsQueryOptions, trialBalanceQueryOptions } from '../../queries';

export default function TrialBalance() {
  const { t, i18n } = useTranslation('accounting');
  const isRtl = i18n.dir() === 'rtl';
  const t0 = utcCalendarDayKey(now());
  const [asOf, setAsOf] = useState(t0);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [applied, setApplied] = useState<{ as_of: string; branch_id?: number }>({ as_of: t0 });
  const canExport = usePermission('accounting', 'read');

  const { data: chartAccounts = [] } = useQuery(chartAccountsQueryOptions(false));
  const accountNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of chartAccounts) {
      m.set(a.id, resolveCoaDisplayName(a, i18n.language));
    }
    return m;
  }, [chartAccounts, i18n.language]);

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
    setApplied(
      branchId == null ? { as_of: asOf } : { as_of: asOf, branch_id: branchId },
    );
  };

  const exportParams = useMemo(
    () =>
      applied.branch_id == null
        ? { as_of: applied.as_of }
        : { as_of: applied.as_of, branch_id: applied.branch_id },
    [applied],
  );

  const exportCsv = async () => {
    const blob = await exportTrialBalanceCsvBlob(exportParams);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trial_balance.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    const blob = await exportTrialBalancePdfBlob(exportParams);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial_balance_${applied.as_of}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo(
    () =>
      defineColumns<TrialBalanceRow>()([
        {
          id: 'code',
          size: 120,
          meta: { align: 'center' },
          header: t('tb.col.code'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, 'text-center num-latin')}>{row.original.code}</span>
          ),
        },
        {
          id: 'name',
          size: 280,
          meta: { align: 'start' },
          header: t('tb.col.name'),
          cell: ({ row }) => {
            const href = buildLedgerDrillDownUrl({
              account_id: row.original.account_id,
              date_from: `${applied.as_of.slice(0, 4)}-01-01`,
              date_to: applied.as_of,
              branch_id: applied.branch_id,
            });
            const displayName =
              accountNameById.get(row.original.account_id) ?? row.original.name;
            return (
              <span className={journalListCellWrap}>
                <Link
                  to={href}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {displayName}
                </Link>
              </span>
            );
          },
        },
        {
          id: 'type',
          size: 120,
          meta: { align: 'center' },
          header: t('tb.col.type'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, 'text-center')}>
              {accountTypeLabel(t, row.original.account_type)}
            </span>
          ),
        },
        {
          id: 'dr',
          size: 132,
          meta: { align: 'center' },
          header: t('tb.col.debit'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, accountingMoneyCell)}>
              {Number(row.original.total_debit) !== 0 ? formatMoney(row.original.total_debit) : ''}
            </span>
          ),
        },
        {
          id: 'cr',
          size: 132,
          meta: { align: 'center' },
          header: t('tb.col.credit'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, accountingMoneyCell)}>
              {Number(row.original.total_credit) !== 0 ? formatMoney(row.original.total_credit) : ''}
            </span>
          ),
        },
        {
          id: 'net',
          size: 132,
          meta: { align: 'center' },
          header: t('tb.col.net'),
          cell: ({ row }) => (
            <span
              className={cn(
                journalListCellWrap,
                accountingMoneyCell,
                Number(row.original.net) !== 0 && 'font-medium',
              )}
            >
              {formatMoney(row.original.net)}
            </span>
          ),
        },
      ]),
    [t, applied, accountNameById],
  );

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
    <div className={journalPageShellClass(isRtl)} dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={<span className="flex items-center">{t('tb.title')}{balancedBadge}</span>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>{t('tb.as_of')}</Label>
          <DateField value={asOf} onChange={setAsOf} className="w-[200px]" />
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
        <Button type="button" onClick={apply}>
          {t('toolbar.apply')}
        </Button>
        {canExport ? (
          <>
            <Button type="button" variant="outline" onClick={() => void exportCsv()}>
              {t('tb.export')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void exportPdf()}>
              {t('tb.export_pdf')}
            </Button>
          </>
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
        tableDir={isRtl ? 'rtl' : 'ltr'}
        tableClassName="w-full table-fixed"
      />

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border bg-muted/30">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead colSpan={3} className={journalLineHead}>
                  {t('tb.totals_row')}
                </TableHead>
                <TableHead className={journalLineMoneyHead}>{formatMoney(totals.dr)}</TableHead>
                <TableHead className={journalLineMoneyHead}>{formatMoney(totals.cr)}</TableHead>
                <TableHead
                  className={cn(
                    journalLineMoneyHead,
                    !totals.balanced && 'font-semibold text-destructive',
                  )}
                >
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
