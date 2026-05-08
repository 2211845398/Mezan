import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { FloatingFormDialog } from '@/components/shared/FloatingFormDialog';
import { DataTable } from '@/components/shared/DataTable';
import { defineColumns } from '@/components/shared/DataTable/columns';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableCategoryTags } from '@/components/shared/TableCategoryTags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { useCategoryTreeQuery } from '@/features/catalog/queries';
import { purchasingKeys } from '@/features/purchasing/queries';
import { usePermission } from '@/hooks/usePermission';
import { resolveMediaUrl } from '@/lib/mediaUrl';

import { postCreatePurchaseOrdersFromReorder } from '../../api';
import AdjustmentForm from '../adjustments/AdjustmentForm';
import TransferForm from '../transfers/TransferForm';
import { BranchStockFilterBar } from '../../components/BranchStockFilterBar';
import { inventoryKeys, useStockOnHandQuery } from '../../queries';
import type { StockOnHandRow } from '../../types';

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

function statusBadgeClass(status: string): string {
  if (status === 'out_of_stock') return 'bg-destructive/15 text-destructive';
  if (status === 'below_reorder') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
  if (status === 'ok') return 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  return 'bg-muted text-muted-foreground';
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

  const [qDraft, setQDraft] = useState(qText);

  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [movementFormKey, setMovementFormKey] = useState(0);
  const [transferFormKey, setTransferFormKey] = useState(0);

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

  const kpis = useMemo(() => {
    let low = 0;
    let out = 0;
    let damaged = 0;
    let reserved = 0;
    let inTransit = 0;
    for (const r of rows) {
      if (r.reorder_status === 'below_reorder') low += 1;
      if (r.reorder_status === 'out_of_stock') out += 1;
      damaged += r.damaged;
      reserved += r.reserved;
      inTransit += r.in_transit_in + r.in_transit_out;
    }
    return { low, out, damaged, reserved, inTransit };
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
          id: 'sku',
          accessorKey: 'sku',
          header: t('stock.col.sku'),
          cell: ({ row }) => (
            <span className="num-latin tabular-nums" dir="ltr">
              {row.original.sku}
            </span>
          ),
        },
        { id: 'avail', accessorKey: 'available', header: t('stock.col.available') },
        { id: 'oh', accessorKey: 'on_hand', header: t('stock.col.on_hand') },
        { id: 'rsv', accessorKey: 'reserved', header: t('stock.col.reserved') },
        { id: 'dmg', accessorKey: 'damaged', header: t('stock.col.damaged') },
        { id: 'on_order', accessorKey: 'on_order', header: t('stock.col.on_order') },
        { id: 'itin', accessorKey: 'in_transit_in', header: t('stock.col.in_transit_in') },
        { id: 'itout', accessorKey: 'in_transit_out', header: t('stock.col.in_transit_out') },
        { id: 'rp', accessorKey: 'reorder_point', header: t('stock.col.reorder_point') },
        {
          id: 'cov',
          header: t('stock.col.days_cover'),
          cell: ({ row }) => row.original.days_of_cover ?? '—',
        },
        {
          id: 'st',
          header: t('stock.col.status'),
          cell: ({ row }) => (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.original.reorder_status)}`}
            >
              {t(`stock.reorder_status.${row.original.reorder_status}`, row.original.reorder_status)}
            </span>
          ),
        },
        { id: 'uc', accessorKey: 'unit_cost', header: t('stock.col.unit_cost') },
        { id: 'ext', accessorKey: 'extended_cost', header: t('stock.col.extended') },
      ]),
    [t],
  );

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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTransferFormKey((k) => k + 1);
                  setTransferDialogOpen(true);
                }}
              >
                {t('stock.action.transfer')}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t('stock.kpi.low')}</p>
          <p className="text-2xl font-semibold">{kpis.low}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t('stock.kpi.out')}</p>
          <p className="text-2xl font-semibold">{kpis.out}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t('stock.kpi.reserved_units')}</p>
          <p className="text-2xl font-semibold">{kpis.reserved}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t('stock.kpi.damaged_units')}</p>
          <p className="text-2xl font-semibold">{kpis.damaged}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t('stock.kpi.in_transit_units')}</p>
          <p className="text-2xl font-semibold">{kpis.inTransit}</p>
        </div>
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
            <div className="flex gap-2">
              <Input
                id="inv-q"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                placeholder={t('stock.search.placeholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setParam('q', qDraft.trim() || null);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setParam('q', qDraft.trim() || null)}
                className="border-secondary/60 bg-background font-medium text-secondary shadow-none hover:bg-muted/50 hover:text-secondary"
              >
                {t('stock.search.button')}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="reorder-only"
              checked={reorderOnly}
              onCheckedChange={(v) => setParam('reorder_only', v ? '1' : null)}
            />
            <Label htmlFor="reorder-only">{t('stock.filter.reorder_only')}</Label>
          </div>
        </div>
      </div>

      <DataTable
        mode="client"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
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

      <FloatingFormDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        title={t('transfers.new')}
        maxWidth="lg"
      >
        {transferDialogOpen ? (
          <TransferForm
            key={transferFormKey}
            variant="dialog"
            onDismiss={() => setTransferDialogOpen(false)}
          />
        ) : null}
      </FloatingFormDialog>
    </div>
  );
}
