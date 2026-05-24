import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ChevronRight, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StatusStepper } from '@/components/shared/StatusStepper';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BranchCombobox } from '@/features/admin/components/BranchCombobox';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { getProduct, type ProductVariantPurchasingSearchItem } from '@/features/catalog/api';
import { catalogKeys } from '@/features/catalog/queries';
import PoLineUomSelect from '@/features/purchasing/components/PoLineUomSelect';
import { buildProductUomOptions } from '@/features/purchasing/lib/productUomOptions';
import { usePermission } from '@/hooks/usePermission';
import { formatIso } from '@/lib/date';
import { baseUnitsToDisplayQty, qtyToBaseUnits } from '@/lib/productUomQty';
import { formatQtyWithUom } from '@/lib/formatQtyWithUom';

import { draftLineFromSearchVariant, qtyBaseAlreadyForVariant, type DraftTransferLine } from './transferDraft';

import {
  createTransferBatch,
  deleteTransferBatch,
  getTransferBatch,
  postDispatchTransfer,
  postReceiveTransfer,
} from '../../api';
import { VariantSearchSelect } from '../../components/VariantSearchSelect';
import { inventoryKeys, stockOnHandQueryOptions } from '../../queries';
import type { StockOnHandRow } from '../../types';

function stockRowForVariant(rows: StockOnHandRow[], variantId: number): StockOnHandRow | undefined {
  return rows.find((r) => r.variant_id === variantId);
}

function availableForVariant(rows: StockOnHandRow[], variantId: number): number {
  return stockRowForVariant(rows, variantId)?.available ?? 0;
}

export type TransferFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
};

export default function TransferForm({ variant = 'page', onDismiss }: TransferFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const { t: tCatalog } = useTranslation('catalog');
  const qc = useQueryClient();
  const canUpdate = usePermission('inventory', 'update');
  const actorBranchId = useAuthStore((s) => s.activeBranchId ?? s.user?.branch_id ?? null);
  const isNew = !id || id === 'new';
  const batchId = id && !isNew ? Number(id) : null;

  const { data: batch, refetch } = useQuery({
    queryKey: inventoryKeys.transfer(batchId ?? 0),
    queryFn: () => getTransferBatch(batchId!),
    enabled: batchId != null && !Number.isNaN(batchId),
  });

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantPurchasingSearchItem | null>(null);
  const [lineQty, setLineQty] = useState('1');
  const [lineUomId, setLineUomId] = useState(0);
  const [lines, setLines] = useState<DraftTransferLine[]>([]);

  const pickerProductId = selectedVariant?.product_id ?? 0;
  const { data: pickerProduct } = useQuery({
    queryKey: catalogKeys.product(pickerProductId),
    queryFn: () => getProduct(pickerProductId),
    enabled: pickerProductId > 0,
  });
  const lineUomOptions = useMemo(
    () => (pickerProduct ? buildProductUomOptions(tCatalog, pickerProduct) : []),
    [pickerProduct, tCatalog],
  );

  useEffect(() => {
    if (lineUomOptions.length > 0) {
      setLineUomId(lineUomOptions[0]!.id);
    } else {
      setLineUomId(0);
    }
  }, [pickerProductId, lineUomOptions]);

  const fromBranchName = useMemo(
    () => branches.find((b) => String(b.id) === from)?.name ?? null,
    [branches, from],
  );

  const fromBranchId = from ? Number(from) : NaN;
  const stockQueryEnabled = Boolean(from) && Number.isFinite(fromBranchId);
  const { data: stockRows = [], isLoading: stockLoading } = useQuery({
    ...stockOnHandQueryOptions({
      branch_id: from,
      limit: 2000,
      offset: 0,
    }),
    enabled: stockQueryEnabled,
  });

  const createM = useMutation({
    mutationFn: () =>
      createTransferBatch({
        from_branch_id: Number(from),
        to_branch_id: Number(to),
        lines: lines.map((l) => {
          if (l.variant_id == null) {
            throw new Error('unresolved_variant');
          }
          return {
            product_id: l.product_id,
            qty: l.qty,
            uom_id: l.uom_id,
            variant_id: l.variant_id,
          };
        }),
      }),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('transfers.created'), { description: t('transfers.created_pending_dispatch') });
      if (onDismiss) {
        onDismiss();
      } else {
        navigate(`/inventory/transfers/${b.id}`);
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const disp = useMutation({
    mutationFn: () => postDispatchTransfer(batchId!),
    onSuccess: () => {
      void refetch();
      toast.success(t('transfers.dispatched'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });
  const recv = useMutation({
    mutationFn: () => postReceiveTransfer(batchId!),
    onSuccess: () => {
      void refetch();
      toast.success(t('transfers.received_ok'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const cancelM = useMutation({
    mutationFn: async () => {
      if (batchId == null || Number.isNaN(batchId)) {
        throw new Error('missing_batch');
      }
      await deleteTransferBatch(batchId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('transfers.cancelled'));
      setCancelOpen(false);
      if (onDismiss) {
        onDismiss();
      } else {
        navigate('/inventory/transfers');
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const [cancelOpen, setCancelOpen] = useState(false);

  if (isNew) {
    const newInner = (
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BranchCombobox
            label={t('transfers.from')}
            value={from ? Number(from) : null}
            onChange={(id) => {
              setFrom(id != null ? String(id) : '');
              setSelectedVariant(null);
            }}
          />
          <BranchCombobox
            label={t('transfers.to')}
            value={to ? Number(to) : null}
            onChange={(id) => setTo(id != null ? String(id) : '')}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
          <div className="min-w-0 md:col-span-6">
            <Label>{t('transfers.line.variant_picker')}</Label>
            <VariantSearchSelect
              value={selectedVariant?.variant_id ?? null}
              onChange={(_id, item) => setSelectedVariant(item)}
              disabled={!from || (stockQueryEnabled && stockLoading)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>{t('transfers.line.qty')}</Label>
            <Input
              value={lineQty}
              onChange={(e) => setLineQty(e.target.value)}
              className="h-9 w-full"
              type="number"
              min={1}
            />
          </div>
          <div className="md:col-span-2">
            <Label>{t('transfers.line.uom')}</Label>
            <PoLineUomSelect
              fullWidth
              disabled={!selectedVariant || lineUomOptions.length === 0}
              uomId={lineUomId}
              options={lineUomOptions}
              onChange={setLineUomId}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="invisible hidden md:block" aria-hidden>
              {t('actions.add_line')}
            </Label>
            <Button
              type="button"
              className="h-9 w-full"
              onClick={() => {
              if (!from) {
                toast.error(t('transfers.errors.select_from_branch'));
                return;
              }
              if (stockQueryEnabled && stockLoading) {
                toast.error(t('transfers.errors.stock_loading'));
                return;
              }
              const v = selectedVariant;
              if (v == null) {
                toast.error(t('transfers.errors.select_variant'));
                return;
              }
              if (lineUomId <= 0) {
                return;
              }
              const q = Number(lineQty);
              if (!Number.isFinite(q) || q <= 0) {
                return;
              }
              const vid = v.variant_id;
              const qtyBase = qtyToBaseUnits(q, lineUomId, lineUomOptions);
              const already = qtyBaseAlreadyForVariant(lines, vid);
              const availBase = availableForVariant(stockRows, vid);
              const uomOpt = lineUomOptions.find((o) => o.id === lineUomId);
              const uomSym = uomOpt?.label?.split(/\s/).pop() ?? '';
              if (already + qtyBase > availBase) {
                toast.error(
                  t('transfers.errors.insufficient_at_source', {
                    available: baseUnitsToDisplayQty(availBase, lineUomId, lineUomOptions),
                    requested: baseUnitsToDisplayQty(already + qtyBase, lineUomId, lineUomOptions),
                    uom: uomSym,
                  }),
                );
                return;
              }
              setLines([...lines, draftLineFromSearchVariant(v, q, lineUomId, lineUomOptions)]);
              setSelectedVariant(null);
              setLineQty('1');
            }}
            >
              {t('actions.add_line')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {!from
            ? t('transfers.errors.select_from_branch')
            : stockQueryEnabled && stockLoading
              ? t('transfers.errors.stock_loading')
              : selectedVariant && lineUomId > 0
                ? (() => {
                    const row = stockRowForVariant(stockRows, selectedVariant.variant_id);
                    const uomOpt = lineUomOptions.find((o) => o.id === lineUomId);
                    const uomSym = uomOpt?.label ?? '';
                    if (!row) {
                      return `${fromBranchName ?? t('transfers.from')}: 0`;
                    }
                    return t('transfers.line.stock_hint', {
                      available: formatQtyWithUom(
                        baseUnitsToDisplayQty(row.available, lineUomId, lineUomOptions),
                        uomSym,
                      ),
                      reserved: formatQtyWithUom(
                        baseUnitsToDisplayQty(row.reserved, lineUomId, lineUomOptions),
                        uomSym,
                      ),
                      on_hand: formatQtyWithUom(
                        baseUnitsToDisplayQty(row.on_hand, lineUomId, lineUomOptions),
                        uomSym,
                      ),
                    });
                  })()
                : null}
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%] text-start">{t('transfers.line.product')}</TableHead>
                <TableHead className="w-[22%] text-start">{t('transfers.line.variant_name')}</TableHead>
                <TableHead className="w-[16%] text-start">{t('transfers.line.reference_code')}</TableHead>
                <TableHead className="w-[10%] text-start">{t('transfers.line.qty')}</TableHead>
                <TableHead className="w-[14%] text-start">{t('transfers.line.uom')}</TableHead>
                <TableHead className="w-[16%] text-end">{t('transfers.line.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    {t('transfers.lines_empty')}
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((l, i) => (
                  <TableRow key={`line-${i}`}>
                    <TableCell className="align-top text-start font-medium">{l.product_name}</TableCell>
                    <TableCell className="align-top text-start">{l.variant_name}</TableCell>
                    <TableCell className="align-top num-latin tabular-nums text-start" dir="ltr">
                      {l.reference_code || '—'}
                    </TableCell>
                    <TableCell className="align-top tabular-nums text-start">{l.qty}</TableCell>
                    <TableCell className="align-top text-start">{l.uom_label}</TableCell>
                    <TableCell className="align-top text-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                        {t('transfers.remove_line')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={
              createM.isPending ||
              !lines.length ||
              lines.some((l) => l.variant_id == null) ||
              !from ||
              !to ||
              from === to
            }
            onClick={() => {
              if (!from || !to || from === to || !lines.length) {
                return;
              }
              if (lines.some((l) => l.variant_id == null)) {
                toast.error(t('transfers.errors.resolve_lines'));
                return;
              }
              if (stockQueryEnabled && stockLoading) {
                toast.error(t('transfers.errors.stock_loading'));
                return;
              }
              const totals = new Map<number, number>();
              for (const l of lines) {
                if (l.variant_id == null) continue;
                totals.set(l.variant_id, (totals.get(l.variant_id) ?? 0) + l.qty_base);
              }
              for (const [variantId, totalBase] of totals) {
                const avail = availableForVariant(stockRows, variantId);
                if (totalBase > avail) {
                  toast.error(
                    t('transfers.errors.insufficient_at_source', {
                      available: avail,
                      requested: totalBase,
                      uom: '',
                    }),
                  );
                  return;
                }
              }
              void createM.mutate();
            }}
          >
            {t('actions.create')}
          </Button>
          {onDismiss ? (
            <Button type="button" variant="ghost" onClick={onDismiss}>
              {t('actions.cancel')}
            </Button>
          ) : (
            <Button type="button" variant="ghost" asChild>
              <Link to="/inventory/transfers">{t('actions.cancel')}</Link>
            </Button>
          )}
        </div>
      </>
    );

    if (variant === 'page') {
      return (
        <div className="flex flex-col gap-6 p-6" dir={i18n.dir()}>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/dashboard">{tc('nav.dashboard')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="size-4 rtl:rotate-180" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/inventory/stock">{tc('nav.inventory')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="size-4 rtl:rotate-180" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/inventory/transfers">{tc('nav.inventory_transfers')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="size-4 rtl:rotate-180" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>{t('transfers.new')}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <PageHeader title={t('transfers.new')} subtitle={t('transfers.subtitle')} />
          <div className="w-full max-w-5xl space-y-6 me-auto">{newInner}</div>
        </div>
      );
    }

    return <div className="w-full max-w-3xl space-y-4 p-4 me-auto">{newInner}</div>;
  }

  if (batch == null) {
    return <p className="p-4 text-muted-foreground">{t('loading')}</p>;
  }

  const fromName = batch.from_branch_name?.trim() ? batch.from_branch_name : String(batch.from_branch_id);
  const toName = batch.to_branch_name?.trim() ? batch.to_branch_name : String(batch.to_branch_id);
  const batchLines = batch.lines ?? [];
  const totalUnits = batchLines.reduce((a, l) => a + l.qty, 0);
  const lineCount = batchLines.length;
  const statusLabel = t(`transfers.status.${batch.status}`, { defaultValue: batch.status });
  const branchAllowsDispatch = actorBranchId == null || actorBranchId === batch.from_branch_id;
  const branchAllowsReceive = actorBranchId == null || actorBranchId === batch.to_branch_id;
  const showDispatch = canUpdate && batch.status === 'pending_dispatch' && branchAllowsDispatch;
  const showReceive = canUpdate && batch.status === 'in_transit' && branchAllowsReceive;
  const showCancel = canUpdate && batch.status === 'pending_dispatch' && branchAllowsDispatch;
  const creatorDisplay = batch.created_by_user_name?.trim() || null;
  const showRoleHintCard = batch.status !== 'received';
  const roleHintSingle =
    batch.status === 'pending_dispatch'
      ? t('transfers.detail.pending_reserve_hint')
      : batch.status === 'in_transit'
        ? t('transfers.detail.in_transit_dest_hint')
        : t('transfers.detail.dispatch_branch_hint');

  const transferSteps = [
    { key: 'pending_dispatch', label: t('transfers.status.pending_dispatch'), sublabel: batch.created_at ? String(batch.created_at).slice(0, 10) : undefined },
    { key: 'in_transit', label: t('transfers.status.in_transit'), sublabel: batch.dispatched_at ? String(batch.dispatched_at).slice(0, 10) : undefined },
    { key: 'received', label: t('transfers.status.received'), sublabel: batch.received_at ? String(batch.received_at).slice(0, 10) : undefined },
  ];

  const detailShell =
    variant === 'dialog' ? 'mx-auto max-w-6xl space-y-6' : 'mx-auto max-w-6xl space-y-6 p-4 sm:p-6';

  return (
    <div className={detailShell}>
      <div className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('transfers.detail.title', { id: batch.id })}</h1>
          <StatusBadge status={batch.status} label={statusLabel} />
        </div>
        {variant === 'page' ? (
          <div className="shrink-0">
            <BackButton to="/inventory/transfers" label={t('actions.back')} />
          </div>
        ) : null}
      </div>

      {/* Lifecycle stepper */}
      <div className="rounded-xl border bg-muted/20 px-4 py-3">
        <StatusStepper steps={transferSteps} current={batch.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Card className="flex min-h-0 flex-col border-2 border-border/80 shadow-sm">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-lg">{t('transfers.detail.route_title')}</CardTitle>
            <CardDescription>{t('transfers.detail.cost_note')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-6">
            <div className="flex flex-col items-stretch gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{t('transfers.from')}</p>
                <p className="mt-1 text-base font-semibold leading-snug">{fromName}</p>
              </div>
              <ChevronRight className="mx-auto size-6 shrink-0 text-muted-foreground rtl:rotate-180 sm:mx-0" aria-hidden />
              <div className="min-w-0 flex-1 sm:text-end">
                <p className="text-xs font-medium text-muted-foreground">{t('transfers.to')}</p>
                <p className="mt-1 text-base font-semibold leading-snug">{toName}</p>
              </div>
            </div>

            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              {/* RTL: first cell = top-right; LTR: first cell = top-left — same logical order */}
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_creator')}</p>
                <p className="mt-1 text-sm font-medium">{creatorDisplay ?? '—'}</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t('transfers.detail.totals')}</p>
                <p className="mt-1 text-sm font-medium tabular-nums">{totalUnits}</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t('transfers.detail.line_count')}</p>
                <p className="mt-1 text-sm font-medium tabular-nums">{lineCount}</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_created')}</p>
                <p className="mt-1 text-sm font-medium num-latin">
                  {formatIso(String(batch.created_at), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
              {batch.dispatched_at ? (
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_dispatched')}</p>
                  <p className="mt-1 text-sm font-medium num-latin">
                    {formatIso(String(batch.dispatched_at), 'yyyy-MM-dd HH:mm')}
                  </p>
                </div>
              ) : null}
              {batch.received_at ? (
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_received')}</p>
                  <p className="mt-1 text-sm font-medium num-latin">
                    {formatIso(String(batch.received_at), 'yyyy-MM-dd HH:mm')}
                  </p>
                </div>
              ) : null}
              <div
                className={cn(
                  'rounded-md border bg-card p-3',
                  batch.received_at ? 'sm:col-span-2' : null,
                )}
              >
                <p className="text-xs text-muted-foreground">{t('transfers.detail.meta_updated')}</p>
                <p className="mt-1 text-sm font-medium num-latin">
                  {formatIso(String(batch.updated_at), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col border-2 border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Package className="size-5 text-muted-foreground" aria-hidden />
              <CardTitle className="text-lg">{t('transfers.detail.lines_title')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>{t('transfers.line.product')}</TableHead>
                  <TableHead>{t('transfers.line.variant_name')}</TableHead>
                  <TableHead>{t('transfers.line.reference_code')}</TableHead>
                  <TableHead className="w-20 text-end">{t('transfers.line.qty')}</TableHead>
                  <TableHead className="w-24">{t('transfers.line.uom')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchLines.map((ln) => (
                  <TableRow key={ln.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground num-latin">{ln.id}</TableCell>
                    <TableCell className="font-medium">
                      {ln.product_name && ln.product_name.length > 0
                        ? ln.product_name
                        : `${t('transfers.line.product')} ${ln.product_id}`}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ln.variant_name?.trim() || ln.variant_attributes?.trim() || '—'}
                    </TableCell>
                    <TableCell className="num-latin tabular-nums" dir="ltr">
                      {ln.reference_code?.trim() || '—'}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{ln.qty}</TableCell>
                    <TableCell className="text-sm">
                      {ln.uom_name?.trim() || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {showRoleHintCard ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>{roleHintSingle}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {showCancel ? (
            <Button
              type="button"
              variant="outline"
              disabled={cancelM.isPending}
              onClick={() => setCancelOpen(true)}
            >
              {t('transfers.cancel')}
            </Button>
          ) : null}
          {showDispatch ? (
            <Button type="button" disabled={disp.isPending} onClick={() => void disp.mutate()}>
              {t('transfers.dispatch')}
            </Button>
          ) : null}
          {showReceive ? (
            <Button type="button" disabled={recv.isPending} onClick={() => void recv.mutate()}>
              {t('transfers.receive')}
            </Button>
          ) : null}
          {onDismiss ? (
            <Button type="button" variant="outline" onClick={onDismiss}>
              {t('actions.back')}
            </Button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transfers.cancel_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('transfers.cancel_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelM.isPending}
              onClick={() => void cancelM.mutate()}
            >
              {cancelM.isPending ? t('transfers.cancel_pending') : t('transfers.cancel_confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
