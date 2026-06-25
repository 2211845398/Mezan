import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { SectionCard } from '@/components/shared/ContentSurface';
import { KpiCard, kpiCardGridClassName } from '@/components/shared/charts/KpiCard';
import { DateRangeFields } from '@/components/shared/form/DateRangeFields';
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
import { useAuthStore } from '@/features/auth/stores/authStore';
import { format, now } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { SupplierStatementLineRead } from '../../api';
import { formatSupplierStatementDescription } from '../../lib/supplierStatementDescription';
import { supplierStatementQueryOptions } from '../../queries';
import SupplierStatementLineDrawer from './SupplierStatementLineDrawer';

export default function SupplierStatement() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const { t, i18n } = useTranslation('purchasing');
  const isAr = i18n.language.startsWith('ar');
  const textDir = i18n.dir();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  const [periodEnd, setPeriodEnd] = useState(() => format(now(), 'yyyy-MM-dd'));
  const [periodStart, setPeriodStart] = useState(() =>
    format(subDays(now(), 90), 'yyyy-MM-dd'),
  );
  const [applied, setApplied] = useState({ ps: periodStart, pe: periodEnd });
  const [branchFilter, setBranchFilter] = useState<string>(
    activeBranchId != null ? String(activeBranchId) : '__all',
  );
  const [selectedLine, setSelectedLine] = useState<SupplierStatementLineRead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const branchId = branchFilter === '__all' ? undefined : Number(branchFilter);

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

  const currencyCode = statement?.currency_code ?? 'USD';

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
        {
          id: 'desc',
          accessorKey: 'description',
          header: t('suppliers.statement.col.description'),
          cell: ({ row }) =>
            formatSupplierStatementDescription(row.original, t, i18n.language),
        },
        {
          id: 'debit',
          accessorKey: 'debit',
          header: t('suppliers.statement.col.debit'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums">
              {formatCurrency(String(getValue() ?? '0'), currencyCode)}
            </span>
          ),
        },
        {
          id: 'credit',
          accessorKey: 'credit',
          header: t('suppliers.statement.col.credit'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums">
              {formatCurrency(String(getValue() ?? '0'), currencyCode)}
            </span>
          ),
        },
        {
          id: 'bal',
          accessorKey: 'running_balance',
          header: t('suppliers.statement.col.balance'),
          cell: ({ getValue }) => (
            <span dir="ltr" className="tabular-nums font-medium">
              {formatCurrency(String(getValue() ?? '0'), currencyCode)}
            </span>
          ),
        },
      ]),
    [currencyCode, i18n.language, t],
  );

  if (Number.isNaN(supplierId)) return null;

  const balanceDue = formatCurrency(statement?.balance_due ?? '0', currencyCode);
  const totalPurchases = formatCurrency(statement?.total_purchases ?? '0', currencyCode);
  const totalPaid = formatCurrency(statement?.total_paid ?? '0', currencyCode);

  const metricCards = [
    {
      key: 'due',
      title: t('suppliers.statement.metric.balance_due'),
      value: balanceDue,
    },
    {
      key: 'purchases',
      title: t('suppliers.statement.metric.total_purchases'),
      value: totalPurchases,
    },
    { key: 'paid', title: t('suppliers.statement.metric.total_paid'), value: totalPaid },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className={cn(kpiCardGridClassName)} dir={textDir}>
        {metricCards.map((card) => (
          <KpiCard
            key={card.key}
            title={card.title}
            value={
              <span dir="ltr" className="tabular-nums">
                {card.value}
              </span>
            }
          />
        ))}
      </div>

      <SectionCard title={t('suppliers.statement.ledger_title')}>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <DateRangeFields
            fromValue={periodStart}
            toValue={periodEnd}
            onFromChange={setPeriodStart}
            onToChange={setPeriodEnd}
            fromLabel={<Label>{t('suppliers.statement.date_from')}</Label>}
            toLabel={<Label>{t('suppliers.statement.date_to')}</Label>}
          />
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
          <Button type="button" onClick={() => setApplied({ ps: periodStart, pe: periodEnd })}>
            {t('suppliers.statement.apply')}
          </Button>
        </div>

        <div
          className={cn(
            'mb-3 flex flex-wrap gap-6 text-sm',
            isAr && 'flex-row-reverse justify-end',
          )}
        >
          <span>
            {t('suppliers.statement.opening')}:{' '}
            <span dir="ltr" className="tabular-nums font-medium">
              {formatCurrency(statement?.opening_balance ?? '0', currencyCode)}
            </span>
          </span>
          <span>
            {t('suppliers.statement.closing')}:{' '}
            <span dir="ltr" className="tabular-nums font-medium">
              {formatCurrency(statement?.closing_balance ?? '0', currencyCode)}
            </span>
          </span>
        </div>

        <DataTable
          columns={columns}
          data={statement?.lines ?? []}
          isLoading={stmtLoading}
          emptyMessage={t('suppliers.statement.empty')}
          onRowClick={(row) => {
            setSelectedLine(row);
            setDrawerOpen(true);
          }}
        />
      </SectionCard>

      <SupplierStatementLineDrawer
        line={selectedLine}
        supplierId={supplierId}
        currencyCode={currencyCode}
        {...(branchId != null ? { branchId } : {})}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
