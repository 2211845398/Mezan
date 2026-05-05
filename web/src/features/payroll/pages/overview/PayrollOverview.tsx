import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Play, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { MonthYearField } from '@/components/shared/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { roleCodeLabel } from '@/features/admin/lib/roleLabels';
import { usePermission } from '@/hooks/usePermission';
import { formatIso, now } from '@/lib/date';
import { newIdempotencyKey } from '@/lib/idempotency';
import { cn } from '@/lib/utils';

import type { PayrollOverviewRow } from '../../api';
import {
  approvePayrollPeriod,
  exportPayrollPeriodPdfBlob,
  preparePayrollPeriod,
} from '../../api';
import { payrollKeys, payrollPeriodQueryOptions } from '../../queries';

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
}

function StatCard({ label, value, subtext }: StatCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {subtext ? <p className="text-xs text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function defaultYearMonth(): { year: number; month: number } {
  const d = now();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function payslipStatusLabel(
  status: string,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): string {
  if (status === 'no_payslip') return t('overview.payslip_status.no_payslip');
  if (status === 'draft') return t('overview.payslip_status.draft');
  if (status === 'approved') return t('overview.payslip_status.approved');
  return t(`overview.payslip_status.${status}`, { defaultValue: status });
}

export default function PayrollOverview() {
  const { t } = useTranslation('payroll');
  const { t: tAdmin } = useTranslation('admin');
  const qc = useQueryClient();
  const canApprove = usePermission('payroll', 'approve');
  const canCreate = usePermission('payroll', 'create');
  const canExport = usePermission('payroll', 'export');

  const [{ year, month }, setYm] = useState(defaultYearMonth);

  const { data: period, isLoading, isError, refetch } = useQuery(
    payrollPeriodQueryOptions(year, month),
  );

  const prepare = useMutation({
    mutationFn: () => preparePayrollPeriod(year, month),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: payrollKeys.root });
      toast.success(
        t('overview.prepare_ok', {
          created: res.created_count,
          skipped: res.skipped_existing_count,
        }),
      );
      if (res.failures.length > 0) {
        toast.warning(t('overview.prepare_partial', { count: res.failures.length }));
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const payAll = useMutation({
    mutationFn: async () => {
      const idem = newIdempotencyKey();
      return approvePayrollPeriod(year, month, idem);
    },
    onSuccess: async (paid) => {
      await qc.invalidateQueries({ queryKey: payrollKeys.root });
      if (paid.length === 0) {
        toast.message(t('overview.approve_pay_none'));
      } else {
        toast.success(t('overview.approve_pay_ok'));
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const exportPdf = useMutation({
    mutationFn: () => exportPayrollPeriodPdfBlob(year, month),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${year}-${String(month).padStart(2, '0')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('overview.export_pdf_ok'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const rows = period?.rows ?? [];
  const summary = period?.summary;

  const columns = useMemo(
    () =>
      defineColumns<PayrollOverviewRow>()([
        { id: 'emp', header: t('col.employee'), cell: ({ row }) => row.original.employee_profile_id },
        {
          id: 'name',
          header: t('overview.col.name'),
          cell: ({ row }) => row.original.user_full_name ?? row.original.user_email ?? '—',
        },
        {
          id: 'role',
          accessorFn: (row) => {
            const code = row.user_role_code;
            if (!code) return '';
            return `${code} ${roleCodeLabel(tAdmin, code, code)}`;
          },
          header: t('overview.col.role'),
          cell: ({ row }) =>
            row.original.user_role_code
              ? roleCodeLabel(tAdmin, row.original.user_role_code, row.original.user_role_code)
              : '—',
        },
        {
          id: 'base',
          header: t('overview.col.base_salary'),
          cell: ({ row }) => row.original.base_salary ?? '—',
        },
        {
          id: 'hourly',
          header: t('overview.col.hourly'),
          cell: ({ row }) => row.original.hourly_rate ?? '—',
        },
        {
          id: 'gross',
          header: t('col.gross'),
          cell: ({ row }) => row.original.gross_amount,
        },
        {
          id: 'auto',
          header: t('overview.col.auto_ded'),
          cell: ({ row }) => row.original.automatic_deductions_amount ?? '—',
        },
        {
          id: 'manual',
          header: t('overview.col.manual_ded'),
          cell: ({ row }) => row.original.manual_deductions_amount ?? '—',
        },
        {
          id: 'bonus',
          header: t('overview.col.bonus'),
          cell: ({ row }) => row.original.bonus_amount ?? '—',
        },
        {
          id: 'ot',
          header: t('overview.col.ot'),
          cell: ({ row }) => row.original.overtime_amount ?? '—',
        },
        { id: 'net', header: t('col.net'), cell: ({ row }) => row.original.net_amount },
        {
          id: 'st',
          accessorFn: (row) => payslipStatusLabel(row.payslip_status, t),
          header: t('overview.col.status'),
          cell: ({ row }) => payslipStatusLabel(row.original.payslip_status, t),
        },
        {
          id: 'paid',
          header: t('overview.col.paid'),
          cell: ({ row }) =>
            row.original.paid_at ? formatIso(row.original.paid_at, 'dd-MM-yyyy') : '—',
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            row.original.payslip_id != null ? (
              <Button type="button" size="icon" variant="ghost" asChild>
                <Link
                  to={`/payroll/runs/${row.original.payslip_id}`}
                  aria-label={t('actions.detail')}
                >
                  <Eye className="size-4" />
                </Link>
              </Button>
            ) : null,
        },
      ]),
    [t, tAdmin],
  );

  const approvalLocked = period && !period.is_approval_open;

  const overviewToolbarExtras = (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-[10rem] flex-col gap-1.5">
        <Label htmlFor="payroll-month">{t('overview.month_label')}</Label>
        <MonthYearField
          id="payroll-month"
          value={{ year, month }}
          onChange={setYm}
          onClear={() => setYm(defaultYearMonth())}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('overview.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            {canExport ? (
              <Button
                type="button"
                variant="outline"
                disabled={exportPdf.isPending}
                onClick={() => void exportPdf.mutate()}
              >
                <Download className="me-2 size-4" />
                {t('overview.export_pdf')}
              </Button>
            ) : null}
            {canCreate ? (
              <Button
                type="button"
                variant="outline"
                disabled={prepare.isPending}
                className={cn(
                  'border-secondary bg-background text-secondary hover:bg-secondary/10',
                )}
                onClick={() => void prepare.mutate()}
              >
                <RefreshCw className="me-2 size-4" />
                {t('overview.prepare')}
              </Button>
            ) : null}
            {canApprove ? (
              <Button
                type="button"
                disabled={
                  payAll.isPending || approvalLocked || (summary?.payslips_draft ?? 0) === 0
                }
                title={
                  approvalLocked
                    ? t('overview.gate_tooltip', { date: period?.approval_opens_on ?? '' })
                    : (summary?.payslips_draft ?? 0) === 0
                      ? t('overview.approve_pay_disabled_no_drafts')
                      : undefined
                }
                onClick={() => void payAll.mutate()}
              >
                <Play className="me-2 size-4" />
                {t('overview.approve_pay')}
              </Button>
            ) : null}
          </div>
        }
      />

      <p className="max-w-2xl text-xs text-muted-foreground">{t('overview.month_help')}</p>

      {period && approvalLocked ? (
        <Alert>
          <AlertTitle>{t('overview.gate_title')}</AlertTitle>
          <AlertDescription>
            {t('overview.gate_body', {
              date: period.approval_opens_on,
              month: `${year}-${String(month).padStart(2, '0')}`,
            })}
          </AlertDescription>
        </Alert>
      ) : null}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('overview.kpi.employees')} value={String(summary.employees_total)} />
          <StatCard
            label={t('overview.kpi.missing')}
            value={String(summary.payslips_missing)}
            subtext={t('overview.kpi.missing_hint')}
          />
          <StatCard label={t('overview.kpi.draft')} value={String(summary.payslips_draft)} />
          <StatCard
            label={t('overview.kpi.approved_unpaid')}
            value={String(summary.payslips_approved_unpaid)}
          />
          <StatCard label={t('overview.kpi.paid')} value={String(summary.payslips_paid)} />
          <StatCard label={t('overview.kpi.gross')} value={String(summary.gross_total)} />
          <StatCard label={t('overview.kpi.net')} value={String(summary.net_total)} />
          <StatCard label={t('overview.kpi.bonus')} value={String(summary.bonus_total)} />
        </div>
      ) : null}

      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        toolbarExtras={overviewToolbarExtras}
      />
    </div>
  );
}
