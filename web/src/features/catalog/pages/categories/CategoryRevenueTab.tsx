import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { DateRangeFields } from '@/components/shared/form/DateRangeFields';
import { SectionCard } from '@/components/shared/ContentSurface';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { categoryRevenueQueryOptions } from '@/features/bi/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { Button } from '@/components/ui/button';
import { format, now } from '@/lib/date';
import { formatCurrency } from '@/lib/format';

const DISPLAY_CURRENCY = 'USD';

function num(s: string | undefined | null): number {
  if (s == null || s === '') return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

type CategoryRevenueTabProps = {
  categoryId: number;
};

export function CategoryRevenueTab({ categoryId }: CategoryRevenueTabProps) {
  const { t } = useTranslation('catalog');
  const { t: tBi } = useTranslation('bi');
  const { t: tc } = useTranslation('common');
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  const [periodEnd, setPeriodEnd] = useState(() => format(now(), 'yyyy-MM-dd'));
  const [periodStart, setPeriodStart] = useState(() =>
    format(subDays(now(), 30), 'yyyy-MM-dd'),
  );
  const [branchFilter, setBranchFilter] = useState<number | null>(activeBranchId ?? null);
  const [applied, setApplied] = useState({
    periodStart: format(subDays(now(), 30), 'yyyy-MM-dd'),
    periodEnd: format(now(), 'yyyy-MM-dd'),
    branchFilter: activeBranchId ?? null,
  });

  const qArgs = useMemo(
    () => ({
      period_start: applied.periodStart,
      period_end: applied.periodEnd,
      ...(applied.branchFilter != null ? { branch_id: applied.branchFilter } : {}),
    }),
    [applied],
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    ...categoryRevenueQueryOptions(categoryId, qArgs),
  });

  const categoryRows = useMemo(() => {
    if (!data) return [];
    return [data.self, ...data.children];
  }, [data]);

  const categoryCols = useMemo(
    () =>
      defineColumns<(typeof categoryRows)[0]>()([
        { id: 'name', accessorKey: 'category_name', header: t('categories.revenue_col_category') },
        {
          id: 'rev',
          accessorKey: 'gross_sales',
          header: t('categories.revenue_col_revenue'),
          cell: ({ getValue }) => (
            <span className="tabular-nums num-latin">
              {formatCurrency(num(String(getValue())), DISPLAY_CURRENCY)}
            </span>
          ),
        },
        {
          id: 'inv',
          accessorKey: 'invoice_count',
          header: t('categories.revenue_col_invoices'),
          cell: ({ getValue }) => <span className="tabular-nums num-latin">{String(getValue())}</span>,
        },
      ]),
    [t],
  );

  const productCols = useMemo(
    () =>
      defineColumns<NonNullable<typeof data>['products'][0]>()([
        { id: 'name', accessorKey: 'product_name', header: t('categories.revenue_col_product') },
        {
          id: 'qty',
          accessorKey: 'qty_sold',
          header: t('categories.revenue_col_qty'),
          cell: ({ getValue }) => <span className="tabular-nums num-latin">{String(getValue())}</span>,
        },
        {
          id: 'rev',
          accessorKey: 'gross_sales',
          header: t('categories.revenue_col_revenue'),
          cell: ({ getValue }) => (
            <span className="tabular-nums num-latin">
              {formatCurrency(num(String(getValue())), DISPLAY_CURRENCY)}
            </span>
          ),
        },
        {
          id: 'inv',
          accessorKey: 'invoice_count',
          header: t('categories.revenue_col_invoices'),
          cell: ({ getValue }) => <span className="tabular-nums num-latin">{String(getValue())}</span>,
        },
      ]),
    [t],
  );

  return (
    <div className="space-y-6">
      <SectionCard title={t('categories.revenue_filters_title')} contentClassName="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateRangeFields
            fromValue={periodStart}
            toValue={periodEnd}
            onFromChange={setPeriodStart}
            onToChange={setPeriodEnd}
            fromLabel={<span className="text-sm font-medium">{tBi('filters.period_start')}</span>}
            toLabel={<span className="text-sm font-medium">{tBi('filters.period_end')}</span>}
          />
          <div className="grid min-w-[200px] gap-1">
            <BranchCombobox
              id="category-revenue-branch-filter"
              label={tBi('filters.branch')}
              value={branchFilter}
              onChange={setBranchFilter}
              allowClear
              clearLabel={tBi('filters.branch_all')}
              includeArchived={false}
              showCode={false}
            />
          </div>
          <Button
            type="button"
            onClick={() =>
              setApplied({
                periodStart,
                periodEnd,
                branchFilter,
              })
            }
            disabled={isFetching}
          >
            {tBi('filters.apply')}
          </Button>
        </div>
      </SectionCard>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : isError || !data ? (
        <p className="text-sm text-destructive">{t('categories.revenue_load_error')}</p>
      ) : (
        <>
          <SectionCard title={t('categories.revenue_categories_title')}>
            <DataTable
              mode="client"
              columns={categoryCols}
              data={categoryRows}
              showSearch={false}
              isLoading={false}
              isError={false}
              getRowHref={(row) => `/catalog/categories/${row.category_id}?tab=revenue`}
            />
          </SectionCard>
          <SectionCard title={t('categories.revenue_products_title')}>
            {data.products.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('categories.revenue_products_empty')}</p>
            ) : (
              <DataTable
                mode="client"
                columns={productCols}
                data={data.products}
                showSearch={false}
                isLoading={false}
                isError={false}
                getRowHref={(row) => `/catalog/products/${row.product_id}`}
              />
            )}
          </SectionCard>
        </>
      )}

      {isError ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          {tc('actions.retry')}
        </Button>
      ) : null}
    </div>
  );
}
