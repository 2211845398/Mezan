import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/ContentSurface';
import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAuthStore } from '@/features/auth/stores/authStore';
import { A4InvoicePrintButton } from '@/features/sales/print/A4InvoicePrintDialog';
import type { SalesInvoiceRegisterRow } from '@/features/marketing/api';
import { salesInvoicesRegisterQueryOptions } from '@/features/marketing/queries';
import { usePermission } from '@/hooks/usePermission';
import { format, now } from '@/lib/date';
import { formatCurrencyWithLeadingSymbol, formatNumber } from '@/lib/format';

const PAGE_SIZE = 50;
const DISPLAY_CURRENCY = 'USD';

export default function SalesInvoiceRegister() {
  const { t } = useTranslation('marketing');
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const canRead = usePermission('sales_invoices', 'read');

  const [periodEnd, setPeriodEnd] = useState(() => format(now(), 'yyyy-MM-dd'));
  const [periodStart, setPeriodStart] = useState(() =>
    format(subDays(now(), 30), 'yyyy-MM-dd'),
  );
  const [applied, setApplied] = useState({ ps: periodStart, pe: periodEnd });
  const [page, setPage] = useState(0);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const [branchId, setBranchId] = useState(0);

  useEffect(() => {
    if (branches.length === 0) return;
    setBranchId((prev) => {
      if (prev > 0 && branches.some((b) => b.id === prev)) return prev;
      return activeBranchId ?? branches[0]!.id;
    });
  }, [branches, activeBranchId]);

  const registerQuery = useQuery({
    ...salesInvoicesRegisterQueryOptions({
      branch_id: branchId,
      period_start: applied.ps,
      period_end: applied.pe,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: canRead && branchId > 0,
  });

  const cols = useMemo(
    () =>
      defineColumns<SalesInvoiceRegisterRow>()([
        {
          id: 'num',
          accessorKey: 'invoice_number',
          header: t('salesRegister.col_invoice'),
        },
        {
          id: 'cust',
          accessorKey: 'customer_display',
          header: t('salesRegister.col_customer'),
          cell: ({ row }) => row.original.customer_display ?? '—',
        },
        {
          id: 'at',
          accessorKey: 'created_at',
          header: t('salesRegister.col_date'),
          cell: ({ getValue }) => (
            <span className="num-latin text-muted-foreground">
              {typeof getValue() === 'string' ? String(getValue()).slice(0, 19).replace('T', ' ') : '—'}
            </span>
          ),
        },
        {
          id: 'sub',
          accessorKey: 'subtotal',
          header: t('salesRegister.col_subtotal'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums num-latin">
              {formatCurrencyWithLeadingSymbol(Number.parseFloat(String(getValue())), DISPLAY_CURRENCY)}
            </span>
          ),
        },
        {
          id: 'tot',
          accessorKey: 'total',
          header: t('salesRegister.col_total'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums font-medium num-latin">
              {formatCurrencyWithLeadingSymbol(Number.parseFloat(String(getValue())), DISPLAY_CURRENCY)}
            </span>
          ),
        },
        {
          id: 'print',
          header: '',
          cell: ({ row }) => <A4InvoicePrintButton invoiceId={row.original.id} />,
        },
      ]),
    [t],
  );

  if (!canRead) {
    return <p className="p-6 text-sm text-muted-foreground">403</p>;
  }

  const total = registerQuery.data?.total_count ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  function applyFilters() {
    setApplied({ ps: periodStart, pe: periodEnd });
    setPage(0);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <PageHeader title={t('salesRegister.title')} subtitle={t('salesRegister.subtitle')} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('salesRegister.filters_title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <Label>{t('analytics.period_start')}</Label>
            <DateField value={periodStart} onChange={setPeriodStart} />
          </div>
          <div className="grid gap-1">
            <Label>{t('analytics.period_end')}</Label>
            <DateField value={periodEnd} onChange={setPeriodEnd} />
          </div>
          <div className="grid min-w-[200px] gap-1">
            <Label>{t('salesRegister.branch')}</Label>
            <Select
              value={branchId > 0 ? String(branchId) : ''}
              onValueChange={(v) => {
                setBranchId(Number(v));
                setPage(0);
              }}
              disabled={branches.length === 0}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={applyFilters} disabled={registerQuery.isFetching}>
            {t('analytics.apply')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('salesRegister.kpi_count')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-start">
            <span className="text-2xl font-semibold tabular-nums num-latin">
              {registerQuery.isLoading ? '…' : formatNumber(total)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('salesRegister.kpi_subtotal')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-start">
            <span dir="ltr" className="text-2xl font-semibold tabular-nums num-latin [unicode-bidi:isolate]">
              {registerQuery.isLoading
                ? '…'
                : formatCurrencyWithLeadingSymbol(
                    Number.parseFloat(registerQuery.data?.sum_subtotal ?? '0'),
                    DISPLAY_CURRENCY,
                  )}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('salesRegister.kpi_total')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-start">
            <span dir="ltr" className="text-2xl font-semibold tabular-nums num-latin [unicode-bidi:isolate]">
              {registerQuery.isLoading
                ? '…'
                : formatCurrencyWithLeadingSymbol(
                    Number.parseFloat(registerQuery.data?.sum_total ?? '0'),
                    DISPLAY_CURRENCY,
                  )}
            </span>
          </CardContent>
        </Card>
      </div>

      <SectionCard title={t('salesRegister.table_title')} description={t('salesRegister.table_hint')}>
        <DataTable
          mode="client"
          columns={cols}
          data={registerQuery.data?.items ?? []}
          isLoading={registerQuery.isLoading}
          isError={registerQuery.isError}
          onRetry={() => void registerQuery.refetch()}
          showPagination={false}
          showSearch={false}
          emptyState={<p className="text-sm text-muted-foreground">{t('salesRegister.empty')}</p>}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-sm text-muted-foreground">
            {t('salesRegister.page_range', {
              from: total === 0 ? 0 : page * PAGE_SIZE + 1,
              to: Math.min((page + 1) * PAGE_SIZE, total),
              total,
            })}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
              {t('salesRegister.prev')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= maxPage}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('salesRegister.next')}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
