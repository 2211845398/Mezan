import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ChevronRight, Package } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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
import { getProduct, searchProductVariantsForPurchasing } from '@/features/catalog/api';
import { purchasingVariantNameLabel } from '@/features/catalog/lib/purchasingVariantLabel';
import { catalogKeys } from '@/features/catalog/queries';
import PoLineProductPicker from '@/features/purchasing/components/PoLineProductPicker';
import PoLineUomSelect from '@/features/purchasing/components/PoLineUomSelect';
import PoLineVariantSelect from '@/features/purchasing/components/PoLineVariantSelect';
import { localizedPoLineUomDisplay } from '@/features/purchasing/lib/poLineUomDisplay';
import {
  buildProductUomOptions,
  type ProductUomOption,
} from '@/features/purchasing/lib/productUomOptions';
import { usePermission } from '@/hooks/usePermission';
import { commercialRestockBadgeQueryKey } from '@/hooks/navBadgeInvalidation';
import { formatIso } from '@/lib/date';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { baseUnitsToDisplayQty, qtyToBaseUnits } from '@/lib/productUomQty';
import { formatQtyWithUom } from '@/lib/formatQtyWithUom';

import {
  draftLineFromBatchLine,
  draftLineFromProductVariant,
  draftLineUomDisplay,
  draftLineVariantDisplay,
  type DraftTransferLine,
} from './transferDraft';
import {
  draftLineFromRestockPrefillLine,
  hydrateDraftLineUom,
  isTransferRestockPrefill,
  type TransferRestockPrefill,
} from './transferRestockPrefill';

import {
  createTransferBatch,
  deleteTransferBatch,
  getTransferBatch,
  postDispatchTransfer,
  postReceiveTransfer,
  updateTransferBatch,
} from '../../api';
import { inventoryKeys, stockOnHandQueryOptions } from '../../queries';
import type { StockOnHandRow, TransferLineRead } from '../../types';

function stockRowForVariant(rows: StockOnHandRow[], variantId: number): StockOnHandRow | undefined {
  return rows.find((r) => r.variant_id === variantId);
}

function availableForVariant(rows: StockOnHandRow[], variantId: number): number {
  return stockRowForVariant(rows, variantId)?.available ?? 0;
}

function availableForVariantWithBatchReserve(
  rows: StockOnHandRow[],
  variantId: number,
  batchLines: { variant_id?: number | null; qty_base?: number; qty: number }[] | undefined,
): number {
  const base = availableForVariant(rows, variantId);
  if (!batchLines?.length) return base;
  const reservedOnBatch = batchLines
    .filter((l) => l.variant_id === variantId)
    .reduce((s, l) => s + (l.qty_base ?? l.qty), 0);
  return base + reservedOnBatch;
}

function totalQtyBaseForVariant(lines: DraftTransferLine[], variantId: number): number {
  return lines
    .filter((l) => l.variant_id === variantId)
    .reduce((s, l) => s + l.qty_base, 0);
}

async function fetchVariantStockRows(
  qc: ReturnType<typeof useQueryClient>,
  branchId: string,
  variantId: number,
): Promise<StockOnHandRow[]> {
  return qc.fetchQuery(
    stockOnHandQueryOptions({
      branch_id: branchId,
      variant_id: variantId,
      limit: 1,
      offset: 0,
    }),
  );
}

async function loadUomForProduct(
  tCatalog: ReturnType<typeof useTranslation<'catalog'>>['t'],
  productId: number,
  preferredUomId?: number,
): Promise<{ uom_id: number; uom_options: ProductUomOption[] }> {
  const product = await getProduct(productId);
  const uom_options = buildProductUomOptions(tCatalog, product);
  const baseId = product.uom_id ?? uom_options[0]?.id ?? 0;
  const uom_id =
    preferredUomId != null &&
    preferredUomId > 0 &&
    uom_options.some((o) => o.id === preferredUomId)
      ? preferredUomId
      : baseId;
  return { uom_id, uom_options };
}

export type TransferFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
};

export default function TransferForm({ variant = 'page', onDismiss }: TransferFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');
  const { t: tCatalog } = useTranslation('catalog');
  const qc = useQueryClient();
  const canUpdate = usePermission('inventory', 'update');
  const actorBranchId = useAuthStore((s) => s.activeBranchId ?? s.user?.branch_id ?? null);
  const isNew = /\/inventory\/transfers\/new\/?$/.test(location.pathname);
  const isEdit = /\/inventory\/transfers\/\d+\/edit\/?$/.test(location.pathname);
  const restockPrefill: TransferRestockPrefill | null = useMemo(() => {
    const state = location.state as { restockPrefill?: unknown } | null;
    return isTransferRestockPrefill(state?.restockPrefill) ? state.restockPrefill : null;
  }, [location.state]);
  const prefillFromAlert = isNew && restockPrefill != null;
  const viewBatchId = !isNew && !isEdit && id ? Number(id) : null;
  const editBatchId = isEdit && id ? Number(id) : null;
  const batchId = viewBatchId ?? editBatchId;

  const { data: batch, refetch } = useQuery({
    queryKey: inventoryKeys.transfer(batchId ?? 0),
    queryFn: () => getTransferBatch(batchId!),
    enabled: batchId != null && !Number.isNaN(batchId) && !isNew,
  });

  const [editHydrated, setEditHydrated] = useState(false);

  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lineProductId, setLineProductId] = useState(0);
  const [lineProductPickLabel, setLineProductPickLabel] = useState('');
  const [lineVariantId, setLineVariantId] = useState<number | null>(null);
  const [lineVariantPickLabel, setLineVariantPickLabel] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineUomId, setLineUomId] = useState(0);
  const [lineUomOptions, setLineUomOptions] = useState<ProductUomOption[]>([]);
  const [lines, setLines] = useState<DraftTransferLine[]>([]);
  const restockPrefillApplied = useRef(false);

  useEffect(() => {
    if (!prefillFromAlert || !restockPrefill || restockPrefillApplied.current) return;
    restockPrefillApplied.current = true;
    setFrom(String(restockPrefill.from_branch_id));
    setTo(String(restockPrefill.to_branch_id));
    const draftLines = restockPrefill.lines.map(draftLineFromRestockPrefillLine);
    setLines(draftLines);
    void Promise.all(draftLines.map((line) => hydrateDraftLineUom(tCatalog, line))).then(setLines);
  }, [prefillFromAlert, restockPrefill, tCatalog]);

  const resetLineEntry = () => {
    setLineProductId(0);
    setLineProductPickLabel('');
    setLineVariantId(null);
    setLineVariantPickLabel('');
    setLineQty('1');
    setLineUomId(0);
    setLineUomOptions([]);
  };

  const { data: pickerProduct } = useQuery({
    queryKey: catalogKeys.product(lineProductId),
    queryFn: () => getProduct(lineProductId),
    enabled: lineProductId > 0,
  });

  useEffect(() => {
    if (lineProductId <= 0 || !pickerProduct) return;
    const opts = buildProductUomOptions(tCatalog, pickerProduct);
    setLineUomOptions(opts);
    const baseId = pickerProduct.uom_id ?? opts[0]?.id ?? 0;
    setLineUomId((prev) =>
      prev > 0 && opts.some((o) => o.id === prev) ? prev : baseId,
    );
  }, [lineProductId, pickerProduct, tCatalog]);

  const fromBranchName = useMemo(
    () => branches.find((b) => String(b.id) === from)?.name ?? null,
    [branches, from],
  );
  const toBranchName = useMemo(
    () => branches.find((b) => String(b.id) === to)?.name ?? null,
    [branches, to],
  );

  const fromBranchId = from ? Number(from) : NaN;
  const stockQueryEnabled = Boolean(from) && Number.isFinite(fromBranchId);
  const { data: lineVariantStockRows = [], isLoading: lineVariantStockLoading } = useQuery({
    ...stockOnHandQueryOptions({
      branch_id: from,
      variant_id: lineVariantId ?? '',
      limit: 1,
      offset: 0,
    }),
    enabled: stockQueryEnabled && lineVariantId != null && lineVariantId > 0,
  });

  const buildPayloadLines = () =>
    lines.map((l) => {
      if (l.variant_id == null) {
        throw new Error('unresolved_variant');
      }
      return {
        product_id: l.product_id,
        qty: l.qty,
        uom_id: l.uom_id,
        variant_id: l.variant_id,
      };
    });

  const createM = useMutation({
    mutationFn: () =>
      createTransferBatch({
        from_branch_id: Number(from),
        to_branch_id: Number(to),
        lines: buildPayloadLines(),
      }),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.root });
      void qc.invalidateQueries({ queryKey: commercialRestockBadgeQueryKey() });
      toast.success(t('transfers.created'), { description: t('transfers.created_pending_dispatch') });
      if (onDismiss) {
        onDismiss();
      } else {
        navigate(`/inventory/transfers/${b.id}`);
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const updateM = useMutation({
    mutationFn: () =>
      updateTransferBatch(editBatchId!, {
        from_branch_id: Number(from),
        to_branch_id: Number(to),
        lines: buildPayloadLines(),
      }),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.root });
      toast.success(t('transfers.updated'));
      if (onDismiss) {
        onDismiss();
      } else {
        navigate(`/inventory/transfers/${b.id}`);
      }
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  useEffect(() => {
    if (!isEdit || !batch) {
      setEditHydrated(false);
      return;
    }
    setFrom(String(batch.from_branch_id));
    setTo(String(batch.to_branch_id));
    let cancelled = false;
    void (async () => {
      const loaded = await Promise.all(
        (batch.lines ?? []).map(async (ln) => {
          let draft = draftLineFromBatchLine(ln, tCatalog);
          if (ln.variant_id != null && ln.variant_id > 0) {
            try {
              const hits = await searchProductVariantsForPurchasing({
                product_id: ln.product_id,
                limit: 200,
              });
              const hit = hits.find((h) => h.variant_id === ln.variant_id);
              if (hit) {
                draft = {
                  ...draft,
                  variant_name: purchasingVariantNameLabel(hit),
                  reference_code: (hit.reference_code ?? '').trim() || draft.reference_code,
                };
              }
            } catch {
              /* keep API labels */
            }
          }
          return draft;
        }),
      );
      if (cancelled) return;
      setLines(loaded);
      resetLineEntry();
      setEditHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, batch?.id, batch?.updated_at, tCatalog]);

  const lineQtySnapshotRef = useRef<{ qty: number; qty_base: number }>({ qty: 1, qty_base: 1 });

  const maxAvailableAtSource = (
    rows: StockOnHandRow[],
    variantId: number,
    serverBatchLines?: TransferLineRead[],
  ) =>
    isEdit
      ? availableForVariantWithBatchReserve(rows, variantId, serverBatchLines)
      : availableForVariant(rows, variantId);

  const showInsufficientAtSource = (
    sample: DraftTransferLine,
    availBase: number,
    requestedBase: number,
    uomOptions: ProductUomOption[],
  ) => {
    const uomSym = sample.uom_label.split(/\s/).pop() ?? '';
    toast.error(
      t('transfers.errors.insufficient_at_source', {
        available: baseUnitsToDisplayQty(availBase, sample.uom_id, uomOptions),
        requested: baseUnitsToDisplayQty(requestedBase, sample.uom_id, uomOptions),
        uom: uomSym,
      }),
    );
  };

  const validateAllDraftLinesStock = async (
    draftLines: DraftTransferLine[],
    serverBatchLines?: TransferLineRead[],
  ): Promise<boolean> => {
    if (!from) {
      return false;
    }
    const totals = new Map<number, number>();
    for (const l of draftLines) {
      if (l.variant_id == null) continue;
      totals.set(l.variant_id, (totals.get(l.variant_id) ?? 0) + l.qty_base);
    }
    for (const [variantId, totalBase] of totals) {
      const rows = stockQueryEnabled
        ? await fetchVariantStockRows(qc, from, variantId)
        : [];
      const avail = maxAvailableAtSource(rows, variantId, serverBatchLines);
      if (totalBase > avail) {
        const sample = draftLines.find((l) => l.variant_id === variantId);
        if (!sample) continue;
        const { uom_options } = await loadUomForProduct(tCatalog, sample.product_id, sample.uom_id);
        showInsufficientAtSource(sample, avail, totalBase, uom_options);
        return false;
      }
    }
    return true;
  };

  const commitLineQty = (index: number) => {
    const line = lines[index];
    if (!line) return;
    const snap = lineQtySnapshotRef.current;
    const q = line.qty;
    if (!Number.isFinite(q) || q <= 0) {
      setLines((prev) =>
        prev.map((l, i) => (i === index ? { ...l, qty: snap.qty, qty_base: snap.qty_base } : l)),
      );
      return;
    }
    if (line.variant_id == null || line.variant_id <= 0) return;

    void (async () => {
      try {
        const product = await getProduct(line.product_id);
        const uomOptions = buildProductUomOptions(tCatalog, product);
        const qty_base = qtyToBaseUnits(q, line.uom_id, uomOptions);
        const vid = line.variant_id!;
        const draftWithNew = lines.map((l, i) =>
          i === index ? { ...l, qty: q, qty_base } : l,
        );
        const rows = stockQueryEnabled
          ? await fetchVariantStockRows(qc, from, vid)
          : [];
        const totalBase = totalQtyBaseForVariant(draftWithNew, vid);
        const availBase = maxAvailableAtSource(rows, vid, batch?.lines);
        if (totalBase > availBase) {
          showInsufficientAtSource(line, availBase, totalBase, uomOptions);
          setLines((prev) =>
            prev.map((l, i) =>
              i === index ? { ...l, qty: snap.qty, qty_base: snap.qty_base } : l,
            ),
          );
          return;
        }
        const uomOpt = uomOptions.find((o) => o.id === line.uom_id);
        setLines((prev) =>
          prev.map((l, i) =>
            i === index
              ? {
                  ...l,
                  qty: q,
                  qty_base,
                  uom_label: uomOpt?.label ?? l.uom_label,
                }
              : l,
          ),
        );
        lineQtySnapshotRef.current = { qty: q, qty_base };
      } catch {
        setLines((prev) =>
          prev.map((l, i) =>
            i === index ? { ...l, qty: snap.qty, qty_base: snap.qty_base } : l,
          ),
        );
      }
    })();
  };

  const disp = useMutation({
    mutationFn: () =>
      postDispatchTransfer(
        viewBatchId!,
        actorBranchId != null ? { branch_id: actorBranchId } : {},
      ),
    onSuccess: () => {
      void refetch();
      toast.success(t('transfers.dispatched'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });
  const recv = useMutation({
    mutationFn: () =>
      postReceiveTransfer(
        viewBatchId!,
        actorBranchId != null ? { branch_id: actorBranchId } : {},
      ),
    onSuccess: () => {
      void refetch();
      toast.success(t('transfers.received_ok'));
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  const cancelM = useMutation({
    mutationFn: async () => {
      if (viewBatchId == null || Number.isNaN(viewBatchId)) {
        throw new Error('missing_batch');
      }
      await deleteTransferBatch(viewBatchId);
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

  if (isNew || isEdit) {
    if (isEdit) {
      if (batch == null || editBatchId == null || Number.isNaN(editBatchId)) {
        return <p className="p-4 text-muted-foreground">{t('loading')}</p>;
      }
      if (batch.status !== 'pending_dispatch') {
        return (
          <div className="flex flex-col gap-4 p-6">
            <p className="text-muted-foreground">{t('transfers.errors.update_not_pending')}</p>
            <Button type="button" variant="outline" asChild>
              <Link to={`/inventory/transfers/${batch.id}`}>{t('actions.back')}</Link>
            </Button>
          </div>
        );
      }
      if (!editHydrated) {
        return <p className="p-4 text-muted-foreground">{t('loading')}</p>;
      }
    }

    const savePending = isEdit ? updateM.isPending : createM.isPending;

    const newInner = (
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isEdit ? (
            <>
              <div className="grid gap-2">
                <Label>{t('transfers.from')}</Label>
                <div
                  className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm"
                  aria-readonly
                >
                  {batch?.from_branch_name?.trim() || fromBranchName || from || '—'}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>{t('transfers.to')}</Label>
                <div
                  className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm"
                  aria-readonly
                >
                  {batch?.to_branch_name?.trim() || toBranchName || to || '—'}
                </div>
              </div>
            </>
          ) : prefillFromAlert ? (
            <>
              <BranchCombobox
                kind="warehouse"
                label={t('transfers.from')}
                value={from ? Number(from) : null}
                onChange={(id) => {
                  setFrom(id != null ? String(id) : '');
                  resetLineEntry();
                }}
                showCode={false}
              />
              <div className="grid gap-2">
                <Label>{t('transfers.to')}</Label>
                <div
                  className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm"
                  aria-readonly
                >
                  {toBranchName || to || '—'}
                </div>
              </div>
            </>
          ) : (
            <>
              <BranchCombobox
                label={t('transfers.from')}
                value={from ? Number(from) : null}
                onChange={(id) => {
                  setFrom(id != null ? String(id) : '');
                  resetLineEntry();
                }}
                showCode={false}
              />
              <BranchCombobox
                label={t('transfers.to')}
                value={to ? Number(to) : null}
                onChange={(id) => setTo(id != null ? String(id) : '')}
                showCode={false}
              />
            </>
          )}
        </div>
        {!prefillFromAlert ? (
        <>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
          <div className="min-w-0 md:col-span-5">
            <Label>{t('transfers.line.product')}</Label>
            <PoLineProductPicker
              disabled={!from}
              pickLabel={lineProductPickLabel}
              onPick={(row) => {
                setLineProductId(row.product_id);
                setLineProductPickLabel(row.pick_label);
                setLineVariantId(null);
                setLineVariantPickLabel('');
                void loadUomForProduct(tCatalog, row.product_id, row.uom_id).then(
                  ({ uom_id, uom_options }) => {
                    setLineUomOptions(uom_options);
                    setLineUomId(uom_id);
                  },
                );
              }}
            />
          </div>
          <div className="min-w-0 md:col-span-3">
            <PoLineVariantSelect
              compact
              labelMode="variant"
              placeholder={t('transfers.variant_search_placeholder')}
              productId={lineProductId}
              variantId={lineVariantId}
              variantPickLabel={lineVariantPickLabel}
              disabled={!from || lineProductId <= 0}
              onVariantPick={(variantId, label) => {
                setLineVariantId(variantId);
                setLineVariantPickLabel(label);
              }}
            />
          </div>
          <div className="md:col-span-1">
            <Label>{t('transfers.line.qty')}</Label>
            <Input
              value={lineQty}
              onChange={(e) => setLineQty(e.target.value)}
              className="h-9 w-full"
              type="number"
              min={1}
              disabled={lineVariantId == null || lineVariantId <= 0}
            />
          </div>
          <div className="md:col-span-2">
            <Label>{t('transfers.line.uom')}</Label>
            <PoLineUomSelect
              fullWidth
              disabled={lineProductId <= 0 || lineUomOptions.length === 0}
              uomId={lineUomId}
              options={lineUomOptions}
              onChange={setLineUomId}
            />
          </div>
          <div className="md:col-span-1">
            <Label className="invisible hidden md:block" aria-hidden>
              {t('actions.add_line')}
            </Label>
            <Button
              type="button"
              className="h-9 w-full"
              disabled={lineVariantId == null || lineVariantId <= 0}
              onClick={() => {
                void (async () => {
                  if (!from) {
                    toast.error(t('transfers.errors.select_from_branch'));
                    return;
                  }
                  if (lineProductId <= 0) {
                    toast.error(t('transfers.errors.select_product'));
                    return;
                  }
                  if (lineVariantId == null || lineVariantId <= 0) {
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
                  const hits = await searchProductVariantsForPurchasing({
                    product_id: lineProductId,
                    limit: 200,
                  });
                  const hit = hits.find((h) => h.variant_id === lineVariantId);
                  if (!hit) {
                    toast.error(t('transfers.errors.variant_not_found'));
                    return;
                  }
                  const vid = lineVariantId;
                  const qtyBase = qtyToBaseUnits(q, lineUomId, lineUomOptions);
                  const draftWithNew = [
                    ...lines,
                    {
                      ...draftLineFromProductVariant(
                        hit,
                        q,
                        lineUomId,
                        lineUomOptions,
                        lineProductPickLabel,
                        lineVariantPickLabel,
                      ),
                      qty_base: qtyBase,
                    },
                  ];
                  const totalBase = totalQtyBaseForVariant(draftWithNew, vid);
                  const stockRows = stockQueryEnabled
                    ? await fetchVariantStockRows(qc, from, vid)
                    : [];
                  const availBase = maxAvailableAtSource(stockRows, vid, batch?.lines);
                  if (totalBase > availBase) {
                    const sample = draftWithNew.find((l) => l.variant_id === vid)!;
                    showInsufficientAtSource(sample, availBase, totalBase, lineUomOptions);
                    return;
                  }
                  const row = draftLineFromProductVariant(
                    hit,
                    q,
                    lineUomId,
                    lineUomOptions,
                    lineProductPickLabel,
                    lineVariantPickLabel,
                  );
                  const altUom = lineUomOptions.find((o) => o.id === lineUomId);
                  const baseSym = pickerProduct?.uom_symbol?.trim();
                  const baseName = pickerProduct?.uom_name?.trim();
                  if (altUom?.isBase && baseSym) {
                    row.uom_symbol = baseSym;
                    row.uom_name = baseName ?? '';
                  }
                  row.uom_label =
                    localizedPoLineUomDisplay(tCatalog, row.uom_symbol, row.uom_name) ||
                    altUom?.label ||
                    row.uom_label;
                  row.product_image_url = pickerProduct?.image_url ?? null;
                  setLines([...lines, row]);
                  resetLineEntry();
                })();
              }}
            >
              {t('actions.add_line')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {!from
            ? t('transfers.errors.select_from_branch')
            : lineVariantId != null && lineVariantId > 0 && lineUomId > 0
              ? lineVariantStockLoading
                ? t('transfers.errors.stock_loading')
                : (() => {
                    const row = lineVariantStockRows[0];
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
        </>
        ) : null}
        <div className="overflow-x-auto rounded-md border">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%] align-middle text-start">{t('transfers.line.product')}</TableHead>
                <TableHead className="w-[22%] align-middle text-start">{t('transfers.line.variant_name')}</TableHead>
                <TableHead className="w-[14%] align-middle text-center">{t('stock.col.reference_code')}</TableHead>
                <TableHead className="w-[10%] align-middle text-end tabular-nums">{t('transfers.line.qty')}</TableHead>
                <TableHead className="w-[16%] align-middle text-start">{t('transfers.line.uom')}</TableHead>
                {!prefillFromAlert ? (
                  <TableHead className="w-[16%] align-middle text-end">{t('transfers.line.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={prefillFromAlert ? 5 : 6}
                    className="text-center text-sm text-muted-foreground"
                  >
                    {t('transfers.lines_empty')}
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((l, i) => {
                  const img = l.product_image_url;
                  const src = img ? (resolveMediaUrl(img) ?? img) : null;
                  return (
                  <TableRow key={`line-${l.variant_id ?? i}-${l.product_id}`}>
                    <TableCell className="align-middle text-start font-medium">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="size-9 shrink-0 overflow-hidden rounded-md border bg-muted">
                          {src ? (
                            <img src={src} alt="" className="size-full object-cover" loading="lazy" />
                          ) : null}
                        </div>
                        <span className="truncate">{l.product_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle text-start">{draftLineVariantDisplay(l)}</TableCell>
                    <TableCell className="align-middle text-center">
                      <span
                        className="mx-auto block max-w-full truncate num-latin tabular-nums"
                        dir="ltr"
                        title={l.reference_code || undefined}
                      >
                        {l.reference_code || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-end tabular-nums num-latin">
                      {isEdit ? (
                        <Input
                          type="number"
                          min={1}
                          className="ms-auto h-8 w-20 text-end"
                          value={l.qty}
                          onFocus={() => {
                            lineQtySnapshotRef.current = { qty: l.qty, qty_base: l.qty_base };
                          }}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const next = raw === '' ? 0 : Number(raw);
                            setLines((prev) =>
                              prev.map((row, idx) =>
                                idx === i ? { ...row, qty: Number.isFinite(next) ? next : row.qty } : row,
                              ),
                            );
                          }}
                          onBlur={() => commitLineQty(i)}
                        />
                      ) : (
                        l.qty
                      )}
                    </TableCell>
                    <TableCell className="align-middle text-start">{draftLineUomDisplay(tCatalog, l)}</TableCell>
                    {!prefillFromAlert ? (
                      <TableCell className="align-middle text-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setLines(lines.filter((_, j) => j !== i))}
                        >
                          {t('transfers.remove_line')}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={
              savePending ||
              !lines.length ||
              lines.some((l) => l.variant_id == null) ||
              !from ||
              !to ||
              from === to
            }
            onClick={() => {
              void (async () => {
                if (!from || !to || from === to || !lines.length) {
                  return;
                }
                if (lines.some((l) => l.variant_id == null)) {
                  toast.error(t('transfers.errors.resolve_lines'));
                  return;
                }
                const stockOk = await validateAllDraftLinesStock(
                  lines,
                  isEdit ? batch?.lines : undefined,
                );
                if (!stockOk) {
                  return;
                }
                if (isEdit) {
                  updateM.mutate();
                } else {
                  createM.mutate();
                }
              })();
            }}
          >
            {isEdit ? t('actions.save') : t('actions.create')}
          </Button>
          {onDismiss ? (
            <Button type="button" variant="ghost" onClick={onDismiss}>
              {t('actions.cancel')}
            </Button>
          ) : (
            <Button type="button" variant="ghost" asChild>
              <Link
                to={
                  prefillFromAlert
                    ? '/inventory/alerts'
                    : isEdit && editBatchId
                      ? `/inventory/transfers/${editBatchId}`
                      : '/inventory/transfers'
                }
              >
                {t('actions.cancel')}
              </Link>
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
              {isEdit && editBatchId ? (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to={`/inventory/transfers/${editBatchId}`}>
                        {t('transfers.detail.title', { id: editBatchId })}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator>
                    <ChevronRight className="size-4 rtl:rotate-180" />
                  </BreadcrumbSeparator>
                </>
              ) : null}
              <BreadcrumbItem>
                <BreadcrumbPage>{isEdit ? t('transfers.edit') : t('transfers.new')}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <PageHeader
            title={isEdit ? t('transfers.edit') : t('transfers.new')}
            subtitle={t('transfers.subtitle')}
          />
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
  const showEdit = canUpdate && batch.status === 'pending_dispatch' && branchAllowsDispatch;
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
                  <TableHead className="text-center">{t('stock.col.reference_code')}</TableHead>
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
                    <TableCell className="text-center">
                      <span
                        className="mx-auto block max-w-full truncate num-latin tabular-nums"
                        dir="ltr"
                        title={ln.reference_code?.trim() || undefined}
                      >
                        {ln.reference_code?.trim() || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{ln.qty}</TableCell>
                    <TableCell className="text-sm">
                      {localizedPoLineUomDisplay(tCatalog, ln.uom_symbol, ln.uom_name) || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

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
          {showEdit ? (
            <Button type="button" variant="outline" asChild>
              <Link to={`/inventory/transfers/${batch.id}/edit`}>{t('transfers.edit')}</Link>
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

      {showRoleHintCard ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>{roleHintSingle}</p>
        </div>
      ) : null}

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
