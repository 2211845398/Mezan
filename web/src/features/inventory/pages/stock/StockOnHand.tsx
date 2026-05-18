import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableCategoryTags } from '@/components/shared/TableCategoryTags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { useCategoryTreeQuery } from '@/features/catalog/queries';
import { purchasingKeys } from '@/features/purchasing/queries';
import { usePermission } from '@/hooks/usePermission';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import { postCreatePurchaseOrdersFromReorder } from '../../api';
import { BranchStockFilterBar } from '../../components/BranchStockFilterBar';
import { inventoryKeys, useStockOnHandQuery } from '../../queries';
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

export default function StockOnHand() {
  const { t } = useTranslation('inventory');
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreatePo = usePermission('purchase_orders', 'create');
  const canRecordMovement = usePermission('stock_adjustments', 'create');
  const canCreateTransfer = usePermission('inventory', 'update');

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
  const statusFilter = searchParams.get('status_filter') ?? '';

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

  // Sync debounced search to URL
  useEffect(() => {
    setParam('q', debouncedQ.trim() || null);
  }, [debouncedQ, setParam]);

  const queryParams = useMemo(
    () => ({
      branch_id: branchId ?? '',
      category_id: categoryId ?? '',
      q: qText,
      reorder_only: reorderOnly,
      limit: 500,
      offset: 0,
    }),
    [branchId, categoryId, qText, reorderOnly],
  );

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const { data: tree = [] } = useCategoryTreeQuery();
  const cats = useMemo(() => flattenCats(tree), [tree]);
  const { data: rows = [], isLoading, isError, refetch } = useStockOnHandQuery(queryParams);

  // Client-side status filter (applied on top of server data)
  const filteredRows = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => r.reorder_status === statusFilter);
  }, [rows, statusFilter]);

  const kpis = useMemo(() => {
    let low = 0;
    let out = 0;
    let damaged = 0;
    let reserved = 0;
    let inTransit = 0;
    let totalValue = 0;
    for (const r of rows) {
      if (r.reorder_status === 'below_reorder') low += 1;
      if (r.reorder_status === 'out_of_stock') out += 1;
      damaged += r.damaged;
      reserved += r.reserved;
      inTransit += r.in_transit_in + r.in_transit_out;
      totalValue += Number(r.extended_cost ?? 0);
    }
    return { low, out, damaged, reserved, inTransit, totalValue };
  }, [rows]);

  const createPoM = useMutation({
    mutationFn: () => postCreatePurchaseOrdersFromReorder({}),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('stock.po_created', { count: res.created.length }));
    },
    onError: (e) => notifyApiError(e, t('errors.generic')),
  });

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
          id: 'attrs',
          header: t('stock.col.variant_attrs'),
          cell: ({ row }) => (
            <span className="max-w-[12rem] truncate text-sm text-muted-foreground">
              {row.original.variant_attributes?.trim() ? row.original.variant_attributes : '—'}
            </span>
          ),
        },
        {
          id: 'sku',
          accessorKey: 'variant_sku',
          header: t('stock.col.variant_sku'),
          cell: ({ row }) => (
            <span className="num-latin tabular-nums" dir="ltr">
              {row.original.variant_sku?.trim() || row.original.sku}
            </span>
          ),
        },
        { id: 'avail', accessorKey: 'available', header: t('stock.col.available') },
        { id: 'oh', accessorKey: 'on_hand', header: t('stock.col.on_hand') },
        { id: 'rsv', accessorKey: 'reserved', header: t('stock.col.reserved') },
        { id: 'dmg', accessorKey: 'damaged', header: t('stock.col.damaged') },
        { id: 'on_order', accessorKey: 'on_order', header: t('stock.col.on_order') },
        {
          id: 'st',
          header: t('stock.col.status'),
          cell: ({ row }) => (
            <StatusBadge
              status={row.original.reorder_status}
              label={t(`stock.reorder_status.${row.original.reorder_status}`, row.original.reorder_status)}
            />
          ),
        },
        // Hidden by default: lower-priority columns still accessible via column visibility
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
        { id: 'rp', accessorKey: 'reorder_point', header: t('stock.col.reorder_point') },
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
    statusFilter?: string;
    reorderOnly?: boolean;
    active?: boolean;
    variant?: 'default' | 'warning' | 'danger' | 'success';
  };

  const kpiCards: KpiCard[] = [
    {
      label: t('stock.kpi.out'),
      value: kpis.out,
      statusFilter: 'out_of_stock',
      active: statusFilter === 'out_of_stock',
      variant: kpis.out > 0 ? 'danger' : 'default',
    },
    {
      label: t('stock.kpi.low'),
      value: kpis.low,
      statusFilter: 'below_reorder',
      active: statusFilter === 'below_reorder',
      variant: kpis.low > 0 ? 'warning' : 'default',
    },
    {
      label: t('stock.kpi.reserved_units'),
      value: kpis.reserved,
      variant: 'default',
    },
    {
      label: t('stock.kpi.damaged_units'),
      value: kpis.damaged,
      variant: kpis.damaged > 0 ? 'warning' : 'default',
    },
    {
      label: t('stock.kpi.in_transit_units'),
      value: kpis.inTransit,
      variant: 'default',
    },
    {
      label: t('stock.kpi.total_value'),
      value: formatMoney(kpis.totalValue),
      variant: 'success',
    },
  ];

  function handleKpiClick(card: KpiCard) {
    if (card.statusFilter) {
      if (statusFilter === card.statusFilter) {
        setParam('status_filter', null);
        setParam('reorder_only', null);
      } else {
        setParam('status_filter', card.statusFilter);
        setParam('reorder_only', '1');
      }
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t('stock.title')}
        subtitle={t('stock.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            {canRecordMovement ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMovementFormKey((k) => k + 1);
                  setMovementDialogOpen(true);
                }}
              >
                {t('stock.action.movement')}
              </Button>
            ) : null}
            {canCreateTransfer ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/inventory/transfers/new">{t('stock.action.transfer')}</Link>
              </Button>
            ) : null}
            {canCreatePo ? (
              <Button
                type="button"
                size="sm"
                disabled={createPoM.isPending}
                onClick={() => void createPoM.mutate()}
              >
                {t('stock.action.create_po_alerts')}
              </Button>
            ) : null}
          </div>
        }
      />
      <p className="text-xs text-muted-foreground">{t('stock.wavg_note')}</p>

      {/* KPI Strip — clickable cards filter the table */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => handleKpiClick(card)}
            className={cn(
              'rounded-lg border bg-card p-3 text-start transition-all',
              card.statusFilter
                ? 'cursor-pointer hover:shadow-sm hover:ring-2 hover:ring-primary/40'
                : 'cursor-default',
              card.active && 'ring-2 ring-primary shadow-sm',
              card.variant === 'danger' && 'border-destructive/40',
              card.variant === 'warning' && 'border-amber-400/40',
              card.variant === 'success' && 'border-emerald-400/40',
            )}
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p
              className={cn(
                'mt-1 text-xl font-semibold tabular-nums num-latin',
                card.variant === 'danger' && card.value !== 0 && 'text-destructive',
                card.variant === 'warning' && card.value !== 0 && 'text-amber-700 dark:text-amber-300',
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
          branches={branches}
          branchId={branchId}
          onBranchId={(id) => setParam('branch_id', id == null ? null : String(id))}
          categoryId={categoryId}
          onCategoryId={(id) => setParam('category_id', id == null ? null : String(id))}
          categories={cats}
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
              onCheckedChange={(v) => {
                setParam('reorder_only', v ? '1' : null);
                if (!v) setParam('status_filter', null);
              }}
            />
            <Label htmlFor="reorder-only">{t('stock.filter.reorder_only')}</Label>
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
