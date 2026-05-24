import { useQuery } from '@tanstack/react-query';
import { startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

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
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { now, utcCalendarDayKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { GeneralLedgerLineRead, SubledgerKind } from '../../api';
import PostableAccountPicker from '../../components/PostableAccountPicker';
import SubledgerEntityPicker from '../../components/SubledgerEntityPicker';
import { buildLedgerDrillDownUrl } from '../../lib/ledgerDrillDownUrl';
import { generalLedgerQueryOptions, postableAccountsQueryOptions } from '../../queries';

type GlLineRow = GeneralLedgerLineRead & {
  running_balance?: string;
  partner_display_name?: string | null;
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
  const { t } = useTranslation('accounting');
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
  const [branch, setBranch] = useState(() => searchParams.get('branch_id') ?? '__all');

  const { data: postable = [] } = useQuery(postableAccountsQueryOptions());
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

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
      branch: string;
      customer_id: number | null;
      supplier_id: number | null;
      employee_id: number | null;
    }) => {
      const q = new URLSearchParams();
      if (next.account_id) q.set('account_id', String(next.account_id));
      q.set('date_from', next.date_from);
      q.set('date_to', next.date_to);
      if (next.branch !== '__all') q.set('branch_id', next.branch);
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
    if (branch !== '__all') p.branch_id = Number(branch);
    if (customerId) p.customer_id = customerId;
    if (supplierId) p.supplier_id = supplierId;
    if (employeeId) p.employee_id = employeeId;
    return p;
  }, [accountId, df, dt, branch, customerId, supplierId, employeeId]);

  const { data: lines = [], isLoading, isError, refetch } = useQuery({
    ...generalLedgerQueryOptions(glQueryParams),
    enabled: accountId != null && accountId > 0,
  });

  const applyFilters = () => {
    syncUrl({
      account_id: accountId,
      date_from: df,
      date_to: dt,
      branch,
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
          header: t('gl.col.date'),
          cell: ({ row }) => row.original.entry_date?.slice(0, 10),
        },
        {
          id: 'j',
          header: t('gl.col.je'),
          cell: ({ row }) => (
            <Button variant="link" className="h-auto p-0 num-latin" asChild>
              <Link to={`/accounting/journal/${row.original.journal_entry_id}`}>
                #{row.original.journal_entry_id}
              </Link>
            </Button>
          ),
        },
        {
          id: 'desc',
          header: t('gl.col.desc'),
          cell: ({ row }) => row.original.description,
        },
        {
          id: 'partner',
          header: t('gl.col.partner'),
          cell: ({ row }) => row.original.partner_display_name ?? '—',
        },
        {
          id: 'dr',
          header: t('journal.col.debit'),
          cell: ({ row }) => (
            <span className="block text-end tabular-nums num-latin">
              {row.original.debit !== '0' && row.original.debit !== '0.0000'
                ? formatMoney(row.original.debit)
                : ''}
            </span>
          ),
        },
        {
          id: 'cr',
          header: t('journal.col.credit'),
          cell: ({ row }) => (
            <span className="block text-end tabular-nums num-latin">
              {row.original.credit !== '0' && row.original.credit !== '0.0000'
                ? formatMoney(row.original.credit)
                : ''}
            </span>
          ),
        },
        {
          id: 'run',
          header: t('gl.col.balance'),
          cell: ({ row }) => {
            const run = row.original.running_balance ?? '0';
            const { label, cls } = drCrLabel(run);
            return (
              <span className={cn('block text-end tabular-nums num-latin', cls)}>
                {formatMoney(Math.abs(Number(run)))} {label}
              </span>
            );
          },
        },
      ]),
    [t],
  );

  const shareUrl =
    accountId != null
      ? buildLedgerDrillDownUrl({
          account_id: accountId,
          date_from: df,
          date_to: dt,
          branch_id: branch !== '__all' ? Number(branch) : undefined,
          customer_id: customerId ?? undefined,
          supplier_id: supplierId ?? undefined,
          employee_id: employeeId ?? undefined,
        })
      : null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title={t('gl.title')} />
      <div className="grid max-w-md gap-1">
        <Label>{t('gl.account')}</Label>
        <PostableAccountPicker
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
        <div className="grid max-w-md gap-1">
          <Label>{t('gl.subledger_filter')}</Label>
          <SubledgerEntityPicker
            kind={subledgerKind}
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start px-0"
            onClick={() => {
              setCustomerId(null);
              setSupplierId(null);
              setEmployeeId(null);
            }}
          >
            {t('gl.all_entities')}
          </Button>
        </div>
      ) : null}
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
        <Button type="button" onClick={applyFilters} disabled={!accountId}>
          {t('toolbar.apply')}
        </Button>
        {shareUrl ? (
          <Button type="button" variant="outline" asChild>
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {t('gl.open_in_new_tab')}
            </a>
          </Button>
        ) : null}
      </div>
      <DataTable
        mode="client"
        columns={columns}
        data={accountId ? (lines as GlLineRow[]) : []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
