import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SectionCard } from '@/components/shared/ContentSurface';
import { BackButton, PageHeader } from '@/components/shared/PageHeader';
import { DateField } from '@/components/shared/form/DateField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { listBranches } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { getProduct, searchProductVariantsForPurchasing } from '@/features/catalog/api';
import { purchasingVariantNameLabel } from '@/features/catalog/lib/purchasingVariantLabel';
import PoLineProductPicker from '@/features/purchasing/components/PoLineProductPicker';
import PoLineUomSelect from '@/features/purchasing/components/PoLineUomSelect';
import PoLineVariantSelect from '@/features/purchasing/components/PoLineVariantSelect';
import {
  buildProductUomOptions,
  type ProductUomOption,
} from '@/features/purchasing/lib/productUomOptions';
import { poGoldOutlineButtonClass } from '@/features/purchasing/lib/poButtonStyles';
import { supplierCurrencyLabel } from '@/features/purchasing/lib/supplierCurrencyLabel';
import { fromISO, toISOStringUtc } from '@/lib/date';
import { newIdempotencyKey } from '@/lib/idempotency';
import { formatPersonName } from '@/lib/personName';
import { cn } from '@/lib/utils';

import {
  createPurchaseOrder,
  type PurchaseOrderLineCreate,
  type PurchaseOrderLineRead,
  type PurchaseOrderRead,
  sendPurchaseOrder,
  updatePurchaseOrder,
} from '../../api';
import { purchaseOrderQueryOptions, purchasingKeys, suppliersPickerQueryOptions } from '../../queries';

type LineDraft = {
  key: string;
  product_id: number;
  qty: number;
  pick_label: string;
  variant_id: number | null;
  variant_pick_label: string;
  uom_id: number;
  uom_options: ProductUomOption[];
};

function newLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    product_id: 0,
    qty: 1,
    pick_label: '',
    variant_id: null,
    variant_pick_label: '',
    uom_id: 0,
    uom_options: [],
  };
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

type ReorderLocationState = {
  reorderLines?: Array<{ product_id: number; qty: number }>;
};

export type OrderFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
};

export default function OrderForm({ variant = 'page', onDismiss }: OrderFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('purchasing');
  const { t: tCatalog } = useTranslation('catalog');
  const fieldDir = i18n.dir();
  const localeSelectTriggerClass = cn(
    'h-9 min-w-0 [&>span]:line-clamp-none',
    fieldDir === 'rtl' &&
      'text-start [&>span]:block [&>span]:w-full [&>span]:min-w-0 [&>span]:text-start',
  );
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const pathnameIsNew = /\/purchasing\/orders\/new\/?$/.test(location.pathname);
  const isNew = variant === 'dialog' ? true : pathnameIsNew || id === 'new';
  const poId = !isNew && id ? Number(id) : NaN;
  const reorderAppliedRef = useRef(false);

  const { data: existing } = useQuery({
    ...purchaseOrderQueryOptions(poId),
    enabled: !isNew && !Number.isNaN(poId),
  });
  const { data: suppliers = [] } = useQuery(suppliersPickerQueryOptions());
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false, 'warehouse'),
    queryFn: () => listBranches({ include_archived: false, kind: 'warehouse' }),
  });

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === Number(supplierId)),
    [supplierId, suppliers],
  );

  useEffect(() => {
    reorderAppliedRef.current = false;
  }, [location.pathname, variant]);

  useEffect(() => {
    if (!isNew || reorderAppliedRef.current) return;
    const st = (location.state as ReorderLocationState | null)?.reorderLines;
    if (!st?.length) return;
    reorderAppliedRef.current = true;
    setLines(
      st.map((ln) => ({
        ...newLine(),
        product_id: ln.product_id,
        qty: ln.qty,
      })),
    );
    void Promise.all(
      st.map(async (ln, index) => {
        try {
          const { uom_id, uom_options } = await loadUomForProduct(tCatalog, ln.product_id);
          setLines((prev) =>
            prev.map((x, i) =>
              i === index && x.product_id === ln.product_id ? { ...x, uom_id, uom_options } : x,
            ),
          );
        } catch {
          /* keep defaults */
        }
      }),
    );
    navigate('.', { replace: true, state: {} });
  }, [isNew, location.state, navigate, tCatalog]);

  useEffect(() => {
    if (!existing) return;
    setSupplierId(existing.supplier_id != null ? String(existing.supplier_id) : '');
    setBranchId(existing.branch_id != null ? String(existing.branch_id) : '');
    setExpectedDate(existing.expected_at ? existing.expected_at.slice(0, 10) : '');
    setNotes(existing.notes ?? '');
    const rawLines = existing.lines ?? [];
    let cancelled = false;
    void (async () => {
      const ids = [...new Set(rawLines.map((l) => l.product_id))];
      const names: Record<number, string> = {};
      const skus: Record<number, string> = {};
      const uomByProduct: Record<number, { uom_id: number; uom_options: ProductUomOption[] }> =
        {};
      await Promise.all(
        ids.map(async (pid) => {
          try {
            const p = await getProduct(pid);
            names[pid] = p.name;
            skus[pid] = p.sku;
            uomByProduct[pid] = {
              uom_id: p.uom_id ?? 0,
              uom_options: buildProductUomOptions(tCatalog, p),
            };
          } catch {
            names[pid] = `#${pid}`;
            skus[pid] = '';
            uomByProduct[pid] = { uom_id: 0, uom_options: [] };
          }
        }),
      );
      if (cancelled) return;
      const loaded = await Promise.all(
        rawLines.map(async (ln) => {
          const productName = names[ln.product_id] ?? `#${ln.product_id}`;
          const productSku = skus[ln.product_id] ?? '';
          const pick_label =
            productSku.trim() !== ''
              ? `${productName} — ${productSku}`
              : productName;
          let variant_id: number | null = null;
          let variant_pick_label = '';
          if (ln.variant_id != null && ln.variant_id > 0) {
            variant_id = ln.variant_id;
            try {
              const hits = await searchProductVariantsForPurchasing({
                product_id: ln.product_id,
                limit: 200,
              });
              const hit = hits.find((h) => h.variant_id === ln.variant_id);
              if (hit) {
                variant_pick_label = purchasingVariantNameLabel(hit);
              }
            } catch {
              variant_pick_label = `#${ln.variant_id}`;
            }
          }
          const uomMeta = uomByProduct[ln.product_id];
          const lineUomId = ln.uom_id ?? uomMeta?.uom_id ?? 0;
          const uom_options = uomMeta?.uom_options ?? [];
          const uom_id =
            lineUomId > 0 && uom_options.some((o) => o.id === lineUomId)
              ? lineUomId
              : (uom_options[0]?.id ?? 0);
          return {
            key: String(ln.id),
            product_id: ln.product_id,
            qty: ln.qty,
            pick_label,
            variant_id,
            variant_pick_label,
            uom_id,
            uom_options,
          };
        }),
      );
      if (cancelled) return;
      setLines(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [existing, tCatalog]);

  const supplierDisplayName = useMemo(() => {
    if (!selectedSupplier) return '';
    return (
      formatPersonName(
        selectedSupplier.first_name,
        selectedSupplier.father_name,
        selectedSupplier.family_name,
      ).trim() || selectedSupplier.code
    );
  }, [selectedSupplier]);

  const buildPayloadLines = (): PurchaseOrderLineCreate[] => {
    const filtered = lines.filter((l) => l.product_id > 0 && l.qty > 0 && l.uom_id > 0);
    if (filtered.length === 0) {
      throw new Error('lines');
    }
    return filtered.map(({ product_id, qty, variant_id, uom_id }) => ({
      product_id,
      qty,
      uom_id,
      ...(variant_id != null && variant_id > 0 ? { variant_id } : {}),
    }));
  };

  const buildHeader = () => {
    if (!supplierId) {
      throw new Error('supplier');
    }
    const expected_at =
      expectedDate.trim() === ''
        ? null
        : toISOStringUtc(fromISO(`${expectedDate}T00:00:00.000Z`));
    return {
      supplier_name: supplierDisplayName || '—',
      supplier_id: Number(supplierId),
      branch_id: branchId ? Number(branchId) : null,
      notes: notes.trim() || null,
      expected_at,
    };
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payloadLines = buildPayloadLines();
      const header = buildHeader();
      if (isNew) {
        return createPurchaseOrder({ ...header, lines: payloadLines });
      }
      return updatePurchaseOrder(poId, { ...header, lines: payloadLines });
    },
    onMutate: async () => {
      if (isNew || Number.isNaN(poId)) return {};
      await qc.cancelQueries({ queryKey: purchasingKeys.order(poId) });
      const prev = qc.getQueryData<PurchaseOrderRead>(purchasingKeys.order(poId));
      if (!prev) return {};
      const payloadLines = buildPayloadLines();
      const header = buildHeader();
      const optimisticLines: PurchaseOrderLineRead[] = payloadLines.map((pl, i) => ({
        id: prev.lines?.[i]?.id ?? -(i + 1),
        product_id: pl.product_id,
        variant_id: pl.variant_id ?? null,
        qty: pl.qty,
        uom_id: pl.uom_id,
        qty_base: pl.qty,
        uom_name: '',
        uom_symbol: '',
        ...(pl.unit_cost != null && pl.unit_cost !== ''
          ? { unit_cost: String(pl.unit_cost) }
          : {}),
      }));
      qc.setQueryData(purchasingKeys.order(poId), {
        ...prev,
        ...header,
        status: 'draft',
        lines: optimisticLines,
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      const snap = ctx as { prev?: PurchaseOrderRead } | undefined;
      if (snap?.prev && !Number.isNaN(poId)) {
        qc.setQueryData(purchasingKeys.order(poId), snap.prev);
      }
      if (_err instanceof Error) {
        if (_err.message === 'supplier') {
          toast.error(t('orders.form.supplier_required'));
          return;
        }
        if (_err.message === 'lines') {
          toast.error(t('orders.form.lines_required'));
          return;
        }
      }
      notifyApiError(_err, t('errors.generic'));
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(isNew ? t('orders.form.created') : t('orders.form.saved_draft'));
      if (variant === 'dialog') {
        onDismiss?.();
        return;
      }
      if (isNew) {
        navigate(`/purchasing/orders/${row.id}/edit`, { replace: true });
      }
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (isNew || Number.isNaN(poId)) throw new Error('save first');
      const payloadLines = buildPayloadLines();
      const header = buildHeader();
      await updatePurchaseOrder(poId, { ...header, lines: payloadLines });
      const idem = newIdempotencyKey();
      return sendPurchaseOrder(poId, { idempotency_key: idem }, idem);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('orders.form.sent_toast'));
      navigate(`/purchasing/orders/${poId}`);
    },
    onError: (error) => {
      if (error instanceof Error) {
        if (error.message === 'supplier') {
          toast.error(t('orders.form.supplier_required'));
          return;
        }
        if (error.message === 'lines') {
          toast.error(t('orders.form.lines_required'));
          return;
        }
      }
      notifyApiError(error, t('errors.generic'));
    },
  });

  const isDraftPo = isNew || existing?.status === 'draft';
  const canSaveDraft = isNew;
  const formDisabled =
    saveDraft.isPending || send.isPending || (!isNew && existing != null && !isDraftPo);

  const formBody = (
    <div className="flex w-full flex-col gap-4">
      {!isNew && existing != null && !isDraftPo ? (
        <p className="text-sm text-muted-foreground">{t('orders.form.not_draft_readonly')}</p>
      ) : null}
      <SectionCard title={t('orders.form.header_section')}>
        <div className="grid gap-4 md:grid-cols-12">
        <div className="grid gap-2 md:col-span-8" dir={fieldDir}>
          <Label>{t('orders.form.supplier')}</Label>
          <Select
            value={supplierId || '__none'}
            onValueChange={(v) => setSupplierId(v === '__none' ? '' : v)}
            disabled={formDisabled}
          >
            <SelectTrigger dir={fieldDir} className={localeSelectTriggerClass}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent dir={fieldDir}>
              <SelectItem value="__none">—</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {formatPersonName(s.first_name, s.father_name, s.family_name) || s.code} ({s.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 md:col-span-4">
          <Label>{t('orders.form.supplier_currency')}</Label>
          <Input
            readOnly
            tabIndex={-1}
            className="h-9 cursor-default bg-muted/50 text-start"
            value={supplierId ? supplierCurrencyLabel(selectedSupplier, t) : '—'}
          />
        </div>
        <div className="grid gap-2 md:col-span-7" dir={fieldDir}>
          <Label>{t('orders.form.branch')}</Label>
          <Select
            value={branchId || '__none'}
            onValueChange={(v) => setBranchId(v === '__none' ? '' : v)}
            disabled={formDisabled}
          >
            <SelectTrigger dir={fieldDir} className={localeSelectTriggerClass}>
              <SelectValue placeholder={t('orders.form.branch_hint')} />
            </SelectTrigger>
            <SelectContent dir={fieldDir}>
              <SelectItem value="__none">—</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 md:col-span-5">
          <Label>{t('orders.form.expected_date')}</Label>
          <DateField value={expectedDate} onChange={setExpectedDate} disabled={formDisabled} />
        </div>
        </div>
      </SectionCard>

      <SectionCard title={t('orders.form.lines')}>
        <div className="space-y-3">
        {lines.map((ln, idx) => (
          <div
            key={ln.key}
            className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 md:grid-cols-12 md:items-end"
          >
            <div className="grid min-w-0 gap-2 md:col-span-5">
              <Label>{t('orders.form.product')}</Label>
              <PoLineProductPicker
                disabled={formDisabled}
                pickLabel={ln.pick_label}
                onPick={(row) => {
                  setLines((prev) =>
                    prev.map((x, i) =>
                      i === idx
                        ? {
                            ...x,
                            product_id: row.product_id,
                            pick_label: row.pick_label,
                            variant_id: null,
                            variant_pick_label: '',
                            uom_id: row.uom_id ?? 0,
                            uom_options: [],
                          }
                        : x,
                    ),
                  );
                  void loadUomForProduct(tCatalog, row.product_id, row.uom_id).then(
                    ({ uom_id, uom_options }) => {
                      setLines((prev) =>
                        prev.map((x, i) =>
                          i === idx && x.product_id === row.product_id
                            ? { ...x, uom_id, uom_options }
                            : x,
                        ),
                      );
                    },
                  );
                }}
              />
            </div>
            <div className="min-w-0 md:col-span-3">
              <PoLineVariantSelect
                compact
                productId={ln.product_id}
                variantId={ln.variant_id}
                variantPickLabel={ln.variant_pick_label}
                disabled={formDisabled}
                onVariantPick={(variantId, label) =>
                  setLines((prev) =>
                    prev.map((x, i) =>
                      i === idx
                        ? { ...x, variant_id: variantId, variant_pick_label: label }
                        : x,
                    ),
                  )
                }
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>{t('orders.form.qty')}</Label>
              <Input
                className="h-9"
                type="number"
                min={1}
                value={ln.qty}
                disabled={formDisabled}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) || 1 } : x)),
                  )
                }
              />
            </div>
            <div className="grid min-w-0 gap-2 md:col-span-1">
              <Label>{t('orders.form.unit')}</Label>
              <PoLineUomSelect
                fullWidth
                disabled={formDisabled || ln.product_id <= 0}
                uomId={ln.uom_id}
                options={ln.uom_options}
                onChange={(uomId) =>
                  setLines((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, uom_id: uomId } : x)),
                  )
                }
              />
            </div>
            <div className="flex items-end justify-end md:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                disabled={formDisabled}
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                aria-label="remove"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={formDisabled}
          onClick={() => setLines((prev) => [...prev, newLine()])}
        >
          <Plus className="me-2 size-4" />
          {t('orders.form.add_line')}
        </Button>
        </div>
      </SectionCard>

      <SectionCard title={t('orders.form.notes')}>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          disabled={formDisabled}
          onChange={(e) => setNotes(e.target.value)}
        />
      </SectionCard>

      <div className="flex flex-wrap items-center justify-start gap-2 border-t pt-4">
        {canSaveDraft ? (
          <Button type="button" onClick={() => saveDraft.mutate()} disabled={formDisabled}>
            {t('orders.form.save_draft')}
          </Button>
        ) : null}
        {variant === 'dialog' && onDismiss ? (
          <Button type="button" variant="outline" onClick={onDismiss} disabled={formDisabled}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
        ) : null}
        {!isNew && !Number.isNaN(poId) && isDraftPo ? (
          <Button
            type="button"
            variant="outline"
            className={cn(poGoldOutlineButtonClass)}
            disabled={formDisabled}
            onClick={() => void send.mutateAsync()}
          >
            {t('orders.form.send')}
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (variant === 'dialog') {
    return <div className="flex flex-col gap-4">{formBody}</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {isNew ? t('orders.new') : t('orders.edit')}
            {!isNew && existing?.status === 'draft' ? (
              <StatusBadge status="draft" label={t('orders.status.draft')} />
            ) : null}
          </span>
        }
        actions={<BackButton to="/purchasing/orders" label={t('orders.title')} />}
      />
      <div className="me-auto flex w-full max-w-6xl flex-col gap-4">{formBody}</div>
    </div>
  );
}
