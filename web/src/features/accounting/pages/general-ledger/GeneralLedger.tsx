import { useQuery } from '@tanstack/react-query';
import { startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateRangeFields } from '@/components/shared/form/DateRangeFields';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { GeneralLedgerLineRead, SubledgerKind } from '../../api';
import { AccountingBranchFilter } from '../../components/AccountingBranchFilter';
import PostableAccountPicker from '../../components/PostableAccountPicker';
import SubledgerEntityPicker from '../../components/SubledgerEntityPicker';
import {
  accountingMoneyCell,
  journalListCellWrap,
} from '../../lib/accountingTableClasses';
import { formatJournalEntryDescription } from '../../lib/journalEntryDescription';
import { journalPageShellClass } from '../../lib/journalPageLayout';
import { generalLedgerQueryOptions, postableAccountsQueryOptions } from '../../queries';

type GlLineRow = GeneralLedgerLineRead & {
  description_label: string;
  partner_label: string;
};

function drCrLabel(balance: string): { label: string; cls: string } {
  const n = Number(balance);
  if (n > 0) return { label: `(Dr)`, cls: 'text-emerald-700 dark:text-emerald-400' };
  if (n < 0) return { label: `(Cr)`, cls: 'text-destructive' };
  return { label: '(Nil)', cls: 'text-muted-foreground' };
}

function parseIntParam(v: string | null): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function GeneralLedger() {
  const { t, i18n } = useTranslation('accounting');
  const isRtl = i18n.dir() === 'rtl';
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultFrom = utcCalendarDayKey(startOfMonth(now()));
  const defaultTo = utcCalendarDayKey(now());

  const [accountId, setAccountId] = useState<number | null>(() =>
    parseIntParam(searchParams.get('account_id')),
  );
  const [subledgerKind, setSubledgerKind] = useState<SubledgerKind>('none');
  const [customerId, setCustomerId] = useState<number | null>(() =>
    parseIntParam(searchParams.get('customer_id')),
  );
  const [supplierId, setSupplierId] = useState<number | null>(() =>
    parseIntParam(searchParams.get('supplier_id')),
  );
  const [employeeId, setEmployeeId] = useState<number | null>(() =>
    parseIntParam(searchParams.get('employee_id')),
  );
  const [df, setDf] = useState(() => searchParams.get('date_from') ?? defaultFrom);
  const [dt, setDt] = useState(() => searchParams.get('date_to') ?? defaultTo);
  const [branchId, setBranchId] = useState<number | null>(() =>
    parseIntParam(searchParams.get('branch_id')),
  );

  const { data: postable = [] } = useQuery(postableAccountsQueryOptions());

  useEffect(() => {
    if (accountId == null) return;
    const acc = postable.find((a) => a.id === accountId);
    if (acc) setSubledgerKind(acc.subledger_kind);
  }, [accountId, postable]);

  const syncUrl = useCallback(
    (next: {
      account_id: number | null;
      date_from: string;
      date_to: string;
      branch_id: number | null;
      customer_id: number | null;
      supplier_id: number | null;
      employee_id: number | null;
    }) => {
      const q = new URLSearchParams();
      if (next.account_id) q.set('account_id', String(next.account_id));
      q.set('date_from', next.date_from);
      q.set('date_to', next.date_to);
      if (next.branch_id) q.set('branch_id', String(next.branch_id));
      if (next.customer_id) q.set('customer_id', String(next.customer_id));
      if (next.supplier_id) q.set('supplier_id', String(next.supplier_id));
      if (next.employee_id) q.set('employee_id', String(next.employee_id));
      setSearchParams(q, { replace: true });
    },
    [setSearchParams],
  );

  const glQueryParams = useMemo(() => {
    if (!accountId) {
      return { account_id: 0, date_from: df, date_to: dt };
    }
    const p: {
      account_id: number;
      date_from: string;
      date_to: string;
      branch_id?: number;
      customer_id?: number;
      supplier_id?: number;
      employee_id?: number;
    } = { account_id: accountId, date_from: df, date_to: dt };
    if (branchId != null) p.branch_id = branchId;
    if (customerId) p.customer_id = customerId;
    if (supplierId) p.supplier_id = supplierId;
    if (employeeId) p.employee_id = employeeId;
    return p;
  }, [accountId, df, dt, branchId, customerId, supplierId, employeeId]);

  const { data: lines = [], isLoading, isError, refetch } = useQuery({
    ...generalLedgerQueryOptions(glQueryParams),
    enabled: accountId != null && accountId > 0,
  });

  const tableRows = useMemo((): GlLineRow[] => {
    return lines.map((ln) => {
      const description_label = formatJournalEntryDescription(
        {
          description: ln.description,
          source_type: ln.source_type ?? 'manual',
          source_id: ln.source_id ?? null,
        },
        t,
        i18n.language,
      );
      const partner_label = ln.partner_display_name?.trim() ?? '';
      return { ...ln, description_label, partner_label };
    });
  }, [lines, t, i18n.language]);

  const applyFilters = () => {
    syncUrl({
      account_id: accountId,
      date_from: df,
      date_to: dt,
      branch_id: branchId,
      customer_id: customerId,
      supplier_id: supplierId,
      employee_id: employeeId,
    });
  };

  useEffect(() => {
    if (accountId) applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial URL sync only when account from link
  }, []);

  const columns = useMemo(
    () =>
      defineColumns<GlLineRow>()([
        {
          id: 'd',
          size: 116,
          meta: { align: 'center' },
          header: t('gl.col.date'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, 'text-center num-latin')}>
              {row.original.entry_date?.slice(0, 10)}
            </span>
          ),
        },
        {
          id: 'j',
          size: 96,
          meta: { align: 'center' },
          header: t('gl.col.je'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, 'text-center')}>
              <Button variant="link" className="h-auto p-0 num-latin" asChild>
                <Link to={`/accounting/journal/${row.original.journal_entry_id}`}>
                  #{row.original.journal_entry_id}
                </Link>
              </Button>
            </span>
          ),
        },
        {
          id: 'desc',
          size: 320,
          meta: { align: 'start' },
          header: t('gl.col.desc'),
          accessorFn: (row) => row.description_label,
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, 'truncate')} dir="auto" title={row.original.description_label}>
              {row.original.description_label}
            </span>
          ),
        },
        {
          id: 'partner',
          size: 200,
          meta: { align: 'start' },
          header: t('gl.col.partner'),
          accessorFn: (row) => row.partner_label,
          cell: ({ row }) => (
            <span className={journalListCellWrap} dir="auto">
              {row.original.partner_label || '—'}
            </span>
          ),
        },
        {
          id: 'dr',
          size: 132,
          meta: { align: 'center' },
          header: t('journal.col.debit'),
          cell: ({ row }) => (
            <span className={cn(journalListCellWrap, accountingMoneyCell)}>
              {row.original.debit !== '0' && row.original.debit !== '0.0000'
                ? formatMoney(row.original.debit)
                : ''}
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
              {row.original.credit !== '0' && row.original.credit !== '0.0000'
                ? formatMoney(row.original.credit)
                : ''}
            </span>
          ),
        },
        {
          id: 'run',
          size: 148,
          meta: { align: 'center' },
          header: t('gl.col.balance'),
          cell: ({ row }) => {
            const run = row.original.running_balance;
            const { label, cls } = drCrLabel(run);
            return (
              <span className={cn(journalListCellWrap, accountingMoneyCell, cls)}>
                {formatMoney(Math.abs(Number(run)))} {label}
              </span>
            );
          },
        },
      ]),
    [t],
  );

  return (
    <div className={journalPageShellClass(isRtl)} dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader title={t('gl.title')} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-[min(100%,280px)] flex-1 gap-1 sm:max-w-md">
          <Label>{t('gl.account')}</Label>
          <PostableAccountPicker
            className="w-full"
            value={accountId}
            onChange={(a) => {
              setAccountId(a?.id ?? null);
              setSubledgerKind(a?.subledger_kind ?? 'none');
              setCustomerId(null);
              setSupplierId(null);
              setEmployeeId(null);
            }}
          />
        </div>
        {subledgerKind !== 'none' ? (
          <div className="grid min-w-[min(100%,280px)] flex-1 gap-1 sm:max-w-md">
            <Label>{t('gl.subledger_filter')}</Label>
            <SubledgerEntityPicker
              className="w-full"
              kind={subledgerKind}
              allowClear
              clearLabel={t('gl.all_entities')}
              value={
                subledgerKind === 'customer'
                  ? customerId
                  : subledgerKind === 'supplier'
                    ? supplierId
                    : employeeId
              }
              onChange={(id) => {
                if (subledgerKind === 'customer') {
                  setCustomerId(id);
                  setSupplierId(null);
                  setEmployeeId(null);
                } else if (subledgerKind === 'supplier') {
                  setSupplierId(id);
                  setCustomerId(null);
                  setEmployeeId(null);
                } else {
                  setEmployeeId(id);
                  setCustomerId(null);
                  setSupplierId(null);
                }
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <DateRangeFields
          fromValue={df}
          toValue={dt}
          onFromChange={setDf}
          onToChange={setDt}
          fromLabel={<Label>{t('period.from')}</Label>}
          toLabel={<Label>{t('period.to')}</Label>}
          fieldClassName="w-[180px]"
        />
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
        <Button type="button" onClick={applyFilters} disabled={!accountId}>
          {t('toolbar.apply')}
        </Button>
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={accountId ? tableRows : []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        tableDir={isRtl ? 'rtl' : 'ltr'}
        tableClassName="w-full table-fixed"
        getRowId={(row) => `${row.journal_entry_id}-${row.line_no}`}
        searchPlaceholder={t('gl.search_placeholder')}
      />
    </div>
  );
}
