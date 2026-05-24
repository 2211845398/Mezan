import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { BackButton } from '@/components/shared/BackButton';
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
import { format, now } from '@/lib/date';
import { formatCurrency, formatMoney } from '@/lib/format';
import { formatPersonName } from '@/lib/personName';
import { supplierCurrencyLabel } from '../../lib/supplierCurrencyLabel';
import { supplierPaymentTermsLabel } from '../../lib/supplierPaymentTermsLabel';
import type { SupplierStatementLineRead } from '../../api';
import {
  supplierEvaluationQueryOptions,
  supplierQueryOptions,
  supplierStatementQueryOptions,
} from '../../queries';
import { paymentTermsQueryOptions } from '@/features/accounting/queries';

const DISPLAY_CURRENCY = 'USD';

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const { t, i18n } = useTranslation('purchasing');
  const isAr = i18n.language.startsWith('ar');
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  const [periodEnd, setPeriodEnd] = useState(() => format(now(), 'yyyy-MM-dd'));
  const [periodStart, setPeriodStart] = useState(() =>
    format(subDays(now(), 90), 'yyyy-MM-dd'),
  );
  const [applied, setApplied] = useState({ ps: periodStart, pe: periodEnd });
  const [branchFilter, setBranchFilter] = useState<string>(
    activeBranchId != null ? String(activeBranchId) : '__all',
  );

  const { data: supplier, isLoading } = useQuery({
    ...supplierQueryOptions(supplierId),
    enabled: !Number.isNaN(supplierId) && supplierId > 0,
  });

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const { data: paymentTerms = [] } = useQuery(paymentTermsQueryOptions(false));

  const branchId =
    branchFilter === '__all' ? undefined : Number(branchFilter);

  const stmtArgs = useMemo(
    () => ({
      date_from: applied.ps,
      date_to: applied.pe,
      ...(branchId != null && !Number.isNaN(branchId) ? { branch_id: branchId } : {}),
    }),
    [applied, branchId],
  );

  const { data: statement, isLoading: stmtLoading } = useQuery({
    ...supplierStatementQueryOptions(supplierId, stmtArgs),
    enabled: !Number.isNaN(supplierId) && supplierId > 0,
  });

  const { data: evaluation } = useQuery({
    ...supplierEvaluationQueryOptions(supplierId, {
      period_days: 365,
      ...(branchId != null && !Number.isNaN(branchId) ? { branch_id: branchId } : {}),
    }),
    enabled: !Number.isNaN(supplierId) && supplierId > 0,
  });

  const columns = useMemo(
    () =>
      defineColumns<SupplierStatementLineRead>()([
        {
          id: 'dt',
          accessorKey: 'entry_date',
          header: t('suppliers.statement.col.date'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums">
              {String(getValue() ?? '')}
            </span>
          ),
        },
        { id: 'ref', accessorKey: 'reference', header: t('suppliers.statement.col.reference') },
        { id: 'desc', accessorKey: 'description', header: t('suppliers.statement.col.description') },
        {
          id: 'debit',
          accessorKey: 'debit',
          header: t('suppliers.statement.col.debit'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums">
              {formatMoney(String(getValue() ?? '0'), DISPLAY_CURRENCY)}
            </span>
          ),
        },
        {
          id: 'credit',
          accessorKey: 'credit',
          header: t('suppliers.statement.col.credit'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums">
              {formatMoney(String(getValue() ?? '0'), DISPLAY_CURRENCY)}
            </span>
          ),
        },
        {
          id: 'bal',
          accessorKey: 'running_balance',
          header: t('suppliers.statement.col.balance'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums font-medium">
              {formatMoney(String(getValue() ?? '0'), DISPLAY_CURRENCY)}
            </span>
          ),
        },
      ]),
    [t],
  );

  if (Number.isNaN(supplierId)) return null;
  if (isLoading || !supplier) {
    return <div className="p-4 text-muted-foreground">…</div>;
  }

  const displayName = formatPersonName(
    supplier.first_name,
    supplier.father_name,
    supplier.family_name,
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t('suppliers.statement.title', { name: displayName || supplier.code })}
          subtitle={t('suppliers.statement.subtitle', { code: supplier.code })}
        />
        <div className="flex flex-wrap gap-2">
          <BackButton to="/purchasing/suppliers" label={t('suppliers.statement.back')} />
          <Button variant="outline" asChild>
            <Link to={`/purchasing/suppliers/${supplierId}/edit`}>{t('suppliers.edit')}</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('suppliers.statement.metric.open_balance')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums" dir="ltr">
            {formatCurrency(evaluation?.open_balance ?? statement?.closing_balance ?? '0', DISPLAY_CURRENCY)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('suppliers.statement.metric.total_purchases')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums" dir="ltr">
            {formatCurrency(evaluation?.total_purchases ?? '0', DISPLAY_CURRENCY)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('suppliers.statement.metric.total_paid')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums" dir="ltr">
            {formatCurrency(evaluation?.total_paid ?? '0', DISPLAY_CURRENCY)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('suppliers.statement.metric.receipts_payments')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm tabular-nums">
            {t('suppliers.statement.metric.receipts_payments_value', {
              receipts: evaluation?.receipt_count ?? 0,
              payments: evaluation?.payment_count ?? 0,
            })}
          </CardContent>
        </Card>
      </div>

      <SectionCard title={t('suppliers.statement.profile_title')}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">{t('suppliers.col.currency')}</dt>
            <dd>{supplierCurrencyLabel(supplier, t)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('suppliers.col.payment_terms')}</dt>
            <dd>{supplierPaymentTermsLabel(supplier, paymentTerms, isAr)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('suppliers.col.tax_id')}</dt>
            <dd>{supplier.tax_id ?? '—'}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title={t('suppliers.statement.ledger_title')}>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <Label>{t('suppliers.statement.date_from')}</Label>
            <DateField value={periodStart} onChange={setPeriodStart} />
          </div>
          <div className="grid gap-1">
            <Label>{t('suppliers.statement.date_to')}</Label>
            <DateField value={periodEnd} onChange={setPeriodEnd} />
          </div>
          <div className="grid min-w-[10rem] gap-1">
            <Label>{t('suppliers.statement.branch')}</Label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t('suppliers.statement.all_branches')}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={() => setApplied({ ps: periodStart, pe: periodEnd })}
          >
            {t('suppliers.statement.apply')}
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap gap-6 text-sm">
          <span>
            {t('suppliers.statement.opening')}:{' '}
            <span dir="ltr" className="tabular-nums font-medium">
              {formatCurrency(statement?.opening_balance ?? '0', DISPLAY_CURRENCY)}
            </span>
          </span>
          <span>
            {t('suppliers.statement.closing')}:{' '}
            <span dir="ltr" className="tabular-nums font-medium">
              {formatCurrency(statement?.closing_balance ?? '0', DISPLAY_CURRENCY)}
            </span>
          </span>
        </div>

        <DataTable
          columns={columns}
          data={statement?.lines ?? []}
          isLoading={stmtLoading}
          emptyMessage={t('suppliers.statement.empty')}
        />
      </SectionCard>
    </div>
  );
}
