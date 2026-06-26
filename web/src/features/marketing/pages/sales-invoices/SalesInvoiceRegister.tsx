import { useMutation, useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { ReportExportButtons } from '@/components/shared/ReportExportButtons';
import { SectionCard } from '@/components/shared/ContentSurface';
import {
  DateRangeFields,
  type DateRangeFieldsHandle,
} from '@/components/shared/form/DateRangeFields';
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
import { getBranchDisplayName } from '@/features/admin/lib/branchLabels';
import { adminKeys } from '@/features/admin/queries';
import { useMe, useMyBranch } from '@/features/auth/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { A4InvoicePrintButton } from '@/features/sales/print/A4InvoicePrintDialog';
import type { SalesInvoiceRegisterRow } from '@/features/marketing/api';
import { exportSalesRegisterPdfBlob, exportSalesRegisterXlsxBlob } from '@/features/marketing/api';
import { InvoiceRepaymentDialog } from '@/features/marketing/components/InvoiceRepaymentDialog';
import { salesInvoicesRegisterSummaryQueryOptions, salesInvoicesRegisterTableQueryOptions } from '@/features/marketing/queries';
import { usePermission } from '@/hooks/usePermission';
import { downloadBlob } from '@/lib/downloadBlob';
import { format, now } from '@/lib/date';
import { formatCurrencyWithLeadingSymbol, formatNumber } from '@/lib/format';
import { isValidInvoicePkId } from '@/lib/salesInvoiceId';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RegisterFilters = {
  branchId: number;
  periodStart: string;
  periodEnd: string;
};

/** Status/payment pills: deepen same hue on hover (avoid Badge `secondary` gold/muted hover). */
const registerBadge = {
  sale: cn(
    'border-transparent bg-emerald-100 text-emerald-900 shadow-none',
    'hover:bg-emerald-200 hover:text-emerald-950',
    'dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900 dark:hover:text-emerald-50',
  ),
  return: cn(
    'border-transparent bg-red-100 text-red-900 shadow-none',
    'hover:bg-red-200 hover:text-red-950',
    'dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900 dark:hover:text-red-50',
  ),
  partial: cn(
    'border-transparent bg-amber-100 text-amber-900 shadow-none',
    'hover:bg-amber-200 hover:text-amber-950',
    'dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900 dark:hover:text-amber-50',
  ),
  paid: cn(
    'border-transparent bg-emerald-100 text-emerald-900 shadow-none',
    'hover:bg-emerald-200 hover:text-emerald-950',
    'dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900 dark:hover:text-emerald-50',
  ),
} as const;
const DISPLAY_CURRENCY = 'USD';

function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

export default function SalesInvoiceRegister() {
  const { t } = useTranslation('marketing');
  const { t: tc } = useTranslation('common');
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const userBranchId = activeBranchId ?? user?.branch_id ?? null;
  const { data: me } = useMe();
  const canRead = usePermission('sales_invoices', 'read');
  const canApplyAr = usePermission('accounting', 'update');
  const canPickBranch = usePermission('branches', 'read');
  const [repayTarget, setRepayTarget] = useState<SalesInvoiceRegisterRow | null>(null);
  const branchNameHint = me?.branch_name?.trim() || user?.branch_name?.trim();
  const { data: myBranch } = useMyBranch({
    enabled: !canPickBranch && userBranchId != null && !branchNameHint,
  });

  const initialPeriodEnd = format(now(), 'yyyy-MM-dd');
  const initialPeriodStart = format(subDays(now(), 30), 'yyyy-MM-dd');

  const [draftFilters, setDraftFilters] = useState<RegisterFilters>({
    branchId: 0,
    periodStart: initialPeriodStart,
    periodEnd: initialPeriodEnd,
  });
  const [appliedFilters, setAppliedFilters] = useState<RegisterFilters>({
    branchId: 0,
    periodStart: initialPeriodStart,
    periodEnd: initialPeriodEnd,
  });
  const [page, setPage] = useState(0);
  const dateRangeRef = useRef<DateRangeFieldsHandle>(null);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
    enabled: canPickBranch,
  });

  const branchDisplayName = getBranchDisplayName(
    branches,
    draftFilters.branchId > 0 ? draftFilters.branchId : userBranchId,
    branchNameHint || myBranch?.name,
  );

  useEffect(() => {
    if (canPickBranch && branches.length > 0) {
      setDraftFilters((prev) => {
        if (prev.branchId > 0 && branches.some((b) => b.id === prev.branchId)) {
          return prev;
        }
        const resolvedId = userBranchId ?? branches[0]!.id;
        return { ...prev, branchId: resolvedId };
      });
      setAppliedFilters((prev) => {
        if (prev.branchId > 0) {
          return prev;
        }
        const resolvedId = userBranchId ?? branches[0]!.id;
        return { ...prev, branchId: resolvedId };
      });
      return;
    }
    if (userBranchId != null && userBranchId > 0) {
      setDraftFilters((prev) =>
        prev.branchId === userBranchId ? prev : { ...prev, branchId: userBranchId },
      );
      setAppliedFilters((prev) =>
        prev.branchId > 0 ? prev : { ...prev, branchId: userBranchId },
      );
    }
  }, [branches, userBranchId, canPickBranch]);

  const registerEnabled = canRead && appliedFilters.branchId > 0;

  const summaryQuery = useQuery({
    ...salesInvoicesRegisterSummaryQueryOptions({
      branch_id: appliedFilters.branchId,
      period_start: appliedFilters.periodStart,
      period_end: appliedFilters.periodEnd,
    }),
    enabled: registerEnabled,
  });

  const tableQuery = useQuery({
    ...salesInvoicesRegisterTableQueryOptions({
      branch_id: appliedFilters.branchId,
      period_start: appliedFilters.periodStart,
      period_end: appliedFilters.periodEnd,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: registerEnabled,
  });

  const exportParams = {
    branch_id: appliedFilters.branchId,
    period_start: appliedFilters.periodStart,
    period_end: appliedFilters.periodEnd,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const exportRegisterPdf = useMutation({
    mutationFn: () => exportSalesRegisterPdfBlob(exportParams),
    onSuccess: (blob) => {
      downloadBlob(blob, `sales-register-${appliedFilters.periodStart}-${appliedFilters.periodEnd}.pdf`);
      toast.success(tc('export.pdf_ok'));
    },
    onError: (error) => notifyApiError(error, t('salesRegister.empty')),
  });

  const exportRegisterExcel = useMutation({
    mutationFn: () => exportSalesRegisterXlsxBlob(exportParams),
    onSuccess: (blob) => {
      downloadBlob(blob, `sales-register-${appliedFilters.periodStart}-${appliedFilters.periodEnd}.xlsx`);
      toast.success(tc('export.excel_ok'));
    },
    onError: (error) => notifyApiError(error, t('salesRegister.empty')),
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
          id: 'txn',
          accessorKey: 'transaction_type',
          header: t('salesRegister.col_txn_type'),
          cell: ({ row }) => {
            const tt = row.original.transaction_type ?? 'sale';
            if (tt === 'return') {
              return (
                <Badge variant="outline" className={registerBadge.return}>
                  {t('salesRegister.txn_return')}
                </Badge>
              );
            }
            return (
              <Badge variant="outline" className={registerBadge.sale}>
                {t('salesRegister.txn_sale')}
              </Badge>
            );
          },
        },
        {
          id: 'status',
          accessorKey: 'payment_status',
          header: t('salesRegister.col_payment'),
          cell: ({ row }) => {
            if (row.original.transaction_type === 'return') {
              return <span className="text-muted-foreground">—</span>;
            }
            const ps = row.original.payment_status ?? 'paid';
            if (ps === 'partially_paid') {
              return (
                <Badge variant="outline" className={registerBadge.partial}>
                  {t('salesRegister.status_partial')}
                </Badge>
              );
            }
            return (
              <Badge variant="outline" className={registerBadge.paid}>
                {t('salesRegister.status_paid')}
              </Badge>
            );
          },
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => {
            const saleRow = row.original.transaction_type !== 'return';
            const invoicePk = isValidInvoicePkId(row.original.id) ? row.original.id : null;
            return (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {saleRow &&
                row.original.payment_status === 'partially_paid' &&
                canApplyAr &&
                invoicePk != null ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRepayTarget(row.original)}
                  >
                    {t('salesRegister.collect_payment')}
                  </Button>
                ) : null}
                {saleRow && invoicePk != null ? (
                  <A4InvoicePrintButton invoiceId={invoicePk} />
                ) : null}
              </div>
            );
          },
        },
      ]),
    [t, canApplyAr],
  );

  if (!canRead) {
    return <p className="p-6 text-sm text-muted-foreground">403</p>;
  }

  const total = summaryQuery.data?.total_count ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const summaryPending = summaryQuery.isLoading || summaryQuery.isFetching;
  const tablePending = tableQuery.isLoading || tableQuery.isFetching;
  const tableRows = tableQuery.data?.items ?? [];
  const canExportTable = registerEnabled && !tablePending && tableRows.length > 0;

  const canApplyFilters = draftFilters.branchId > 0;

  function applyFilters() {
    const dates = dateRangeRef.current?.commitPending() ?? {
      from: draftFilters.periodStart,
      to: draftFilters.periodEnd,
    };
    if (
      draftFilters.branchId <= 0 ||
      !isIsoDate(dates.from) ||
      !isIsoDate(dates.to)
    ) {
      return;
    }
    const next: RegisterFilters = {
      branchId: draftFilters.branchId,
      periodStart: dates.from,
      periodEnd: dates.to,
    };
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(0);
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={t('salesRegister.title')} />
      </div>

      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('salesRegister.filters_title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-3 overflow-x-auto">
          <DateRangeFields
            ref={dateRangeRef}
            fromValue={draftFilters.periodStart}
            toValue={draftFilters.periodEnd}
            onFromChange={(periodStart) =>
              setDraftFilters((prev) => ({ ...prev, periodStart }))
            }
            onToChange={(periodEnd) => setDraftFilters((prev) => ({ ...prev, periodEnd }))}
            fromLabel={<Label className="text-xs">{t('analytics.period_start')}</Label>}
            toLabel={<Label className="text-xs">{t('analytics.period_end')}</Label>}
            cellClassName="grid w-[10.725rem] shrink-0 gap-1"
            fieldClassName="w-full"
          />
          <div className="grid w-[11.55rem] shrink-0 gap-1">
            <Label className="text-xs">{t('salesRegister.branch')}</Label>
            {canPickBranch ? (
              <Select
                value={draftFilters.branchId > 0 ? String(draftFilters.branchId) : ''}
                onValueChange={(v) =>
                  setDraftFilters((prev) => ({ ...prev, branchId: Number(v) }))
                }
                disabled={branches.length === 0}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder={t('salesRegister.branch')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="flex h-10 w-full items-center truncate rounded-md border border-input bg-muted/30 px-3 text-sm">
                {branchDisplayName}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-10 shrink-0 px-5"
            onClick={applyFilters}
            disabled={!canApplyFilters || summaryPending || tablePending}
          >
            {t('analytics.apply')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('salesRegister.kpi_count')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-start">
            <span className="text-2xl font-semibold tabular-nums num-latin">
              {summaryPending ? '…' : formatNumber(total)}
            </span>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('salesRegister.kpi_subtotal')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-start">
            <span dir="ltr" className="text-2xl font-semibold tabular-nums num-latin [unicode-bidi:isolate]">
              {summaryPending
                ? '…'
                : formatCurrencyWithLeadingSymbol(
                    Number.parseFloat(summaryQuery.data?.sum_subtotal ?? '0'),
                    DISPLAY_CURRENCY,
                  )}
            </span>
          </CardContent>
        </Card>
        <Card className="min-w-0 sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('salesRegister.kpi_total')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-start">
            <span dir="ltr" className="text-2xl font-semibold tabular-nums num-latin [unicode-bidi:isolate]">
              {summaryPending
                ? '…'
                : formatCurrencyWithLeadingSymbol(
                    Number.parseFloat(summaryQuery.data?.sum_total ?? '0'),
                    DISPLAY_CURRENCY,
                  )}
            </span>
          </CardContent>
        </Card>
      </div>

      <SectionCard
        title={t('salesRegister.table_title')}
        className="w-full"
        contentClassName="min-w-0"
        actions={
          registerEnabled ? (
            <ReportExportButtons
              disabled={!canExportTable}
              pdfPending={exportRegisterPdf.isPending}
              excelPending={exportRegisterExcel.isPending}
              onExportPdf={() => exportRegisterPdf.mutate()}
              onExportExcel={() => exportRegisterExcel.mutate()}
            />
          ) : null
        }
      >
        <DataTable
          className="w-full"
          mode="client"
          columns={cols}
          data={tableRows}
          isLoading={tablePending}
          isError={tableQuery.isError}
          onRetry={() => void tableQuery.refetch()}
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

      {repayTarget && isValidInvoicePkId(repayTarget.id) ? (
        <InvoiceRepaymentDialog
          open
          onOpenChange={(o) => {
            if (!o) setRepayTarget(null);
          }}
          invoiceId={repayTarget.id}
          invoiceNumber={repayTarget.invoice_number}
          branchId={repayTarget.branch_id}
          onApplied={() => {
            void summaryQuery.refetch();
            void tableQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
