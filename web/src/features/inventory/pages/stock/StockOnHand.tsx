import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableCategoryTags } from '@/components/shared/TableCategoryTags';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCategoryTreeQuery } from '@/features/catalog/queries';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BranchStockFilterBar } from '../../components/BranchStockFilterBar';
import { InventoryStockNavActions } from '../../components/InventoryStockNavActions';
import { useStockOnHandQuery } from '../../queries';
import type { StockOnHandRow } from '../../types';
import AdjustmentForm from '../adjustments/AdjustmentForm';

function flattenCats(nodes: { id: number; name: string; children?: typeof nodes }[]): { id: number; name: string }[] {
  const o: { id: number; name: string }[] = [];
  for (const n of nodes) {
    o.push({ id: n.id, name: n.name });
    if (n.children?.length) {
      o.push(...flattenCats(n.children));
    }
  }
  return o;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

type MetricFilter = 'reserved' | 'damaged' | 'in_transit';

export default function StockOnHand() {
  const { t } = useTranslation('inventory');
  const [searchParams, setSearchParams] = useSearchParams();

  const branchId = useMemo(() => {
    const raw = searchParams.get('branch_id');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const categoryId = useMemo(() => {
    const raw = searchParams.get('category_id');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const qText = searchParams.get('q') ?? '';
  const reorderOnly = searchParams.get('reorder_only') === '1';
  const statusParam = searchParams.get('status') ?? 'all';
  const metricFilter = (searchParams.get('metric') ?? '') as MetricFilter | '';

  const [qDraft, setQDraft] = useState(qText);
  const debouncedQ = useDebounce(qDraft, 300);

  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementFormKey, setMovementFormKey] = useState(0);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value == null || value === '' || value === 'all') {
            next.delete(key);
          } else {
            next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setReorderOnly = useCallback(
    (on: boolean) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (on) {
            next.set('reorder_only', '1');
            next.delete('status_filter');
          } else {
            next.delete('reorder_only');
            next.delete('status_filter');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setMetric = useCallback(
    (metric: MetricFilter | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (metric) next.set('metric', metric);
          else next.delete('metric');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    setParam('q', debouncedQ.trim() || null);
  }, [debouncedQ, setParam]);

  const queryParams = useMemo(
    () => ({
      branch_id: branchId ?? '',
      category_id: categoryId ?? '',
      q: qText,
      reorder_only: reorderOnly,
      status: statusParam !== 'all' ? statusParam : '',
      limit: 100,
      offset: 0,
    }),
    [branchId, categoryId, qText, reorderOnly, statusParam],
  );

  const { data: tree = [] } = useCategoryTreeQuery();
  const cats = useMemo(() => flattenCats(tree), [tree]);
  const { data: rows = [], isLoading, isError, refetch } = useStockOnHandQuery(queryParams);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (metricFilter === 'reserved') r = r.filter((row) => row.reserved > 0);
    else if (metricFilter === 'damaged') r = r.filter((row) => row.damaged > 0);
    else if (metricFilter === 'in_transit')
      r = r.filter((row) => row.in_transit_in + row.in_transit_out > 0);
    return r;
  }, [rows, metricFilter]);

  const kpis = useMemo(() => {
    let low = 0;
    let damaged = 0;
    let reserved = 0;
    let inTransit = 0;
    let totalValue = 0;
    for (const r of rows) {
      if (r.reorder_status === 'below_reorder') low += 1;
      damaged += r.damaged;
      reserved += r.reserved;
      inTransit += r.in_transit_in + r.in_transit_out;
      totalValue += Number(r.extended_cost ?? 0);
    }
    return { low, damaged, reserved, inTransit, totalValue };
  }, [rows]);

  const columns = useMemo(
    () =>
      defineColumns<StockOnHandRow>()([
        {
          id: 'branch',
          header: t('stock.col.branch'),
          cell: ({ row }) => row.original.branch_name,
        },
        {
          id: 'name',
          accessorKey: 'product_name',
          header: t('stock.col.product'),
          cell: ({ row }) => {
            const r = row.original;
            const img = r.product_image_url;
            const src = img ? (resolveMediaUrl(img) ?? img) : null;
            return (
              <div className="flex min-w-0 max-w-[14rem] items-center gap-2">
                <div className="size-9 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : null}
                </div>
                <Link className="truncate font-medium text-primary hover:underline" to={`/inventory/stock/${r.product_id}`}>
                  {r.product_name}
                </Link>
              </div>
            );
          },
        },
        {
          id: 'cat',
          accessorKey: 'category_name',
          header: t('stock.col.category'),
          cell: ({ row }) => <TableCategoryTags tags={[row.original.category_name]} />,
        },
        {
          id: 'variant_name',
          meta: { visibilityLabel: t('stock.col.variant_name') },
          header: () => <span title={t('stock.col.variant_name_hint')}>{t('stock.col.variant_name')}</span>,
          cell: ({ row }) => (
            <span className="max-w-[12rem] truncate text-sm">
              {row.original.variant_name?.trim() ||
                row.original.variant_attributes?.trim() ||
                '—'}
            </span>
          ),
        },
        {
          id: 'ref_code',
          meta: { visibilityLabel: t('stock.col.reference_code') },
          header: () => <span title={t('stock.col.reference_code_hint')}>{t('stock.col.reference_code')}</span>,
          cell: ({ row }) => (
            <span className="num-latin tabular-nums" dir="ltr">
              {row.original.reference_code?.trim() || '—'}
            </span>
          ),
        },
        { id: 'avail', accessorKey: 'available', header: t('stock.col.available') },
        { id: 'oh', accessorKey: 'on_hand', header: t('stock.col.on_hand') },
        {
          id: 'rsv',
          accessorKey: 'reserved',
          meta: { visibilityLabel: t('stock.col.reserved') },
          header: () => <span title={t('stock.col.reserved_hint')}>{t('stock.col.reserved')}</span>,
        },
        { id: 'dmg', accessorKey: 'damaged', header: t('stock.col.damaged') },
        {
          id: 'on_order',
          accessorKey: 'on_order',
          meta: { visibilityLabel: t('stock.col.on_order') },
          header: () => <span title={t('stock.col.on_order_hint')}>{t('stock.col.on_order')}</span>,
        },
        {
          id: 'st',
          meta: { visibilityLabel: t('stock.col.status') },
          header: () => <span title={t('stock.col.status_hint')}>{t('stock.col.status')}</span>,
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.reorder_status}
              label={t(`stock.reorder_status.${row.original.reorder_status}`, row.original.reorder_status)}
            />
          ),
        },
        {
          id: 'itin',
          accessorKey: 'in_transit_in',
          header: t('stock.col.in_transit_in'),
          meta: { defaultHidden: true },
        },
        {
          id: 'itout',
          accessorKey: 'in_transit_out',
          header: t('stock.col.in_transit_out'),
          meta: { defaultHidden: true },
        },
        {
          id: 'cov',
          header: t('stock.col.days_cover'),
          cell: ({ row }) => row.original.days_of_cover ?? '—',
        },
        {
          id: 'uc',
          accessorKey: 'unit_cost',
          header: t('stock.col.unit_cost'),
          meta: { defaultHidden: true },
          cell: ({ row }) => (
            <span className="num-latin tabular-nums">{formatMoney(row.original.unit_cost)}</span>
          ),
        },
        {
          id: 'ext',
          accessorKey: 'extended_cost',
          header: t('stock.col.extended'),
          meta: { defaultHidden: true },
          cell: ({ row }) => (
            <span className="num-latin tabular-nums">{formatMoney(row.original.extended_cost)}</span>
          ),
        },
      ]),
    [t],
  );

  type KpiCard = {
    label: string;
    value: string | number;
    metric?: MetricFilter;
    reorderToggle?: boolean;
    active?: boolean;
    clickable?: boolean;
    variant?: 'default' | 'warning' | 'danger' | 'success';
  };

  const kpiCards: KpiCard[] = [
    {
      label: t('stock.kpi.low'),
      value: kpis.low,
      reorderToggle: true,
      active: reorderOnly,
      clickable: true,
      variant: 'default',
    },
    {
      label: t('stock.kpi.reserved_units'),
      value: kpis.reserved,
      metric: 'reserved',
      active: metricFilter === 'reserved',
      clickable: true,
      variant: 'default',
    },
    {
      label: t('stock.kpi.damaged_units'),
      value: kpis.damaged,
      metric: 'damaged',
      active: metricFilter === 'damaged',
      clickable: true,
      variant: 'default',
    },
    {
      label: t('stock.kpi.in_transit_units'),
      value: kpis.inTransit,
      metric: 'in_transit',
      active: metricFilter === 'in_transit',
      clickable: true,
      variant: 'default',
    },
    {
      label: t('stock.kpi.total_value'),
      value: formatMoney(kpis.totalValue),
      clickable: false,
      variant: 'success',
    },
  ];

  function handleKpiClick(card: KpiCard) {
    if (card.reorderToggle) {
      setReorderOnly(!reorderOnly);
      return;
    }
    if (card.metric) {
      setMetric(metricFilter === card.metric ? null : card.metric);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('stock.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            <InventoryStockNavActions
              onOpenMovementDialog={() => {
                setMovementFormKey((k) => k + 1);
                setMovementDialogOpen(true);
              }}
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            type="button"
            disabled={!card.clickable}
            onClick={() => card.clickable && handleKpiClick(card)}
            className={cn(
              'rounded-lg border border-border bg-card p-3 text-start transition-all',
              card.clickable
                ? 'cursor-pointer hover:shadow-sm hover:ring-2 hover:ring-border'
                : 'cursor-default',
              card.active &&
                card.reorderToggle &&
                'ring-2 ring-border shadow-sm',
              card.active &&
                card.metric &&
                'ring-2 ring-border shadow-sm',
              card.variant === 'success' && 'border-emerald-400/40',
            )}
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p
              className={cn(
                'mt-1 text-xl font-semibold tabular-nums num-latin text-foreground',
                card.variant === 'success' && 'text-emerald-700 dark:text-emerald-400',
              )}
            >
              {card.value}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <BranchStockFilterBar
          branchId={branchId}
          onBranchId={(id) => setParam('branch_id', id == null ? null : String(id))}
          categoryId={categoryId}
          onCategoryId={(id) => setParam('category_id', id == null ? null : String(id))}
          categories={cats}
          status={statusParam}
          onStatus={(v) => setParam('status', v)}
        />
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label htmlFor="inv-q">{t('stock.search.label')}</Label>
            <Input
              id="inv-q"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder={t('stock.search.placeholder')}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="reorder-only"
              checked={reorderOnly}
              onCheckedChange={(v) => setReorderOnly(v)}
            />
            <Label htmlFor="reorder-only" className="font-normal text-muted-foreground">
              {t('stock.filter.reorder_only')}
            </Label>
          </div>
        </div>
      </div>

      <DataTable
        mode="client"
        showSearch={false}
        columns={columns}
        data={filteredRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        getRowId={(r) => `${r.branch_id}-${r.product_id}-${r.variant_id}`}
      />

      <FloatingFormDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        title={t('adjustments.new')}
        maxWidth="lg"
      >
        {movementDialogOpen ? (
          <AdjustmentForm
            key={movementFormKey}
            variant="dialog"
            onDismiss={() => setMovementDialogOpen(false)}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}
