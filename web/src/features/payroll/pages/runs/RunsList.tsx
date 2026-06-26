import { useQuery } from '@tanstack/react-query';

import { paginatedParams } from '@/api/pagination';
import { useTableUrlState } from '@/components/shared/DataTable/useTableUrlState';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { MonthYearField, type MonthYearValue } from '@/components/shared/form';
import { PageHeader } from '@/components/shared/PageHeader';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { lastCalendarDayOfMonth } from '@/lib/date';

import type { PayslipRead } from '../../api';
import { payslipEmployeeDisplay, payslipStatusLabel } from '../../lib/payslipLabels';
import { type PayslipListFilters, payslipsQueryOptions } from '../../queries';

/** `YYYY-MM` → `{ year, month }` for the month picker. */
function parseYm(ym: string): MonthYearValue | null {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [ys, ms] = ym.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!y || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

/** `YYYY-MM` → calendar period bounds as ISO date strings. */
function calendarMonthToPeriod(ym: string): { period_start: string; period_end: string } | null {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [ys, ms] = ym.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!y || m < 1 || m > 12) return null;
  const padM = String(m).padStart(2, '0');
  const period_start = `${y}-${padM}-01`;
  const lastDay = lastCalendarDayOfMonth(y, m);
  const period_end = `${y}-${padM}-${String(lastDay).padStart(2, '0')}`;
  return { period_start, period_end };
}

export default function RunsList() {
  const { t } = useTranslation('payroll');
  const [searchParams, setSearchParams] = useSearchParams();
  const monthYm = searchParams.get('month') ?? '';
  const statusParam = searchParams.get('status') ?? '';

  const period = useMemo(() => calendarMonthToPeriod(monthYm), [monthYm]);

  const [urlQuery] = useTableUrlState({ pageSize: 20 });
  const { limit, offset } = paginatedParams(urlQuery.page, urlQuery.pageSize);
  const searchQ = urlQuery.q?.trim() ?? '';

  const listFilters = useMemo((): PayslipListFilters => {
    const f: PayslipListFilters = { limit, offset };
    if (statusParam === 'draft' || statusParam === 'approved') {
      f.status = statusParam;
    }
    if (period) {
      f.period_start = period.period_start;
      f.period_end = period.period_end;
    }
    if (searchQ) {
      f.q = searchQ;
    }
    return f;
  }, [statusParam, period, limit, offset, searchQ]);

  const { data, isLoading, isError, refetch } = useQuery(payslipsQueryOptions(listFilters));
  const rows = data?.items ?? [];
  const totalRows = data?.total ?? 0;

  const setMonth = (next: string) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (next) n.set('month', next);
        else n.delete('month');
        return n;
      },
      { replace: true },
    );
  };

  const setStatus = (next: string) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (next) n.set('status', next);
        else n.delete('status');
        return n;
      },
      { replace: true },
    );
  };

  const columns = useMemo(
    () =>
      defineColumns<PayslipRead>()([
        {
          id: 'emp',
          header: t('col.employee'),
          accessorFn: (row) =>
            [row.user_full_name, row.user_email, String(row.employee_profile_id)]
              .filter(Boolean)
              .join(' '),
          cell: ({ row }) => payslipEmployeeDisplay(row.original),
        },
        {
          id: 'period_start',
          accessorKey: 'period_start',
          header: t('form.period_start'),
        },
        {
          id: 'period_end',
          accessorKey: 'period_end',
          header: t('form.period_end'),
        },
        {
          id: 'status',
          header: t('col.status'),
          cell: ({ row }) => {
            const s = row.original.status;
            return <StatusBadge status={s} label={payslipStatusLabel(s, t)} />;
          },
        },
        {
          id: 'net',
          header: t('col.net'),
          cell: ({ row }) => String(row.original.net_amount),
        },
      ]),
    [t],
  );

  const monthValue = parseYm(monthYm);

  const toolbarExtras = (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-[10rem] flex-col gap-1.5">
        <Label htmlFor="payroll-runs-month">{t('runs.filters.month')}</Label>
        <MonthYearField
          id="payroll-runs-month"
          value={monthValue}
          placeholder={t('runs.filters.month')}
          onChange={({ year: y, month: m }) =>
            setMonth(`${y}-${String(m).padStart(2, '0')}`)
          }
          onClear={() => setMonth('')}
        />
      </div>
      <div className="flex min-w-[10rem] flex-col gap-1.5">
        <Label htmlFor="payroll-runs-status">{t('runs.filters.status')}</Label>
        <Select value={statusParam || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger id="payroll-runs-status" className="h-10 w-[11rem]">
            <SelectValue placeholder={t('runs.filters.status_all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('runs.filters.status_all')}</SelectItem>
            <SelectItem value="draft">{t('status.draft')}</SelectItem>
            <SelectItem value="approved">{t('status.approved')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t('runs.title')} />
      <DataTable
        mode="server"
        columns={columns}
        data={rows}
        totalRows={totalRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        toolbarExtras={toolbarExtras}
        getRowHref={(row) => `/payroll/runs/${row.id}`}
      />
    </div>
  );
}
