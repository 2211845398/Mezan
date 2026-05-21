import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
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
import { getProduct } from '@/features/catalog/api';
import PoLineProductPicker from '@/features/purchasing/components/PoLineProductPicker';
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
import { purchaseOrderQueryOptions, purchasingKeys, suppliersQueryOptions } from '../../queries';

type LineDraft = {
  key: string;
  product_id: number;
  qty: number;
  pick_label: string;
};

function newLine(): LineDraft {
  return { key: crypto.randomUUID(), product_id: 0, qty: 1, pick_label: '' };
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
  const { data: suppliers = [] } = useQuery(suppliersQueryOptions());
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
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
        key: crypto.randomUUID(),
        product_id: ln.product_id,
        qty: ln.qty,
        pick_label: '',
      })),
    );
    navigate('.', { replace: true, state: {} });
  }, [isNew, location.state, navigate]);

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
      await Promise.all(
        ids.map(async (pid) => {
          try {
            const p = await getProduct(pid);
            names[pid] = p.name;
          } catch {
            names[pid] = `#${pid}`;
          }
        }),
      );
      if (cancelled) return;
      setLines(
        rawLines.map((ln) => ({
          key: String(ln.id),
          product_id: ln.product_id,
          qty: ln.qty,
          pick_label: names[ln.product_id] ?? `#${ln.product_id}`,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [existing]);

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
    const filtered = lines.filter((l) => l.product_id > 0 && l.qty > 0);
    if (filtered.length === 0) {
      throw new Error('lines');
    }
    return filtered.map(({ product_id, qty }) => ({ product_id, qty }));
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
        ...(pl.unit_cost != null && pl.unit_cost !== ''
          ? { unit_cost: String(pl.unit_cost) }
          : {}),
      }));
      qc.setQueryData(purchasingKeys.order(poId), { ...prev, ...header, lines: optimisticLines });
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
      toast.success(t('orders.form.created'));
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

  const formBody = (
    <div className="flex w-full flex-col gap-4">
      <SectionCard title={t('orders.form.header_section')}>
        <div className="grid gap-4 md:grid-cols-12">
        <div className="grid gap-2 md:col-span-8" dir={fieldDir}>
          <Label>{t('orders.form.supplier')}</Label>
          <Select
            value={supplierId || '__none'}
            onValueChange={(v) => setSupplierId(v === '__none' ? '' : v)}
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
          <Select value={branchId || '__none'} onValueChange={(v) => setBranchId(v === '__none' ? '' : v)}>
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
          <DateField value={expectedDate} onChange={setExpectedDate} />
        </div>
        </div>
      </SectionCard>

      <SectionCard title={t('orders.form.lines')}>
        <div className="space-y-3">
        {lines.map((ln, idx) => (
          <div
            key={ln.key}
            className="grid gap-3 rounded-lg border bg-muted/30 p-3 md:grid-cols-12 md:items-end"
          >
            <div className="md:col-span-9">
              <Label>{t('orders.form.product')}</Label>
              <PoLineProductPicker
                disabled={saveDraft.isPending}
                pickLabel={ln.pick_label}
                onPick={(row) => {
                  setLines((prev) =>
                    prev.map((x, i) =>
                      i === idx
                        ? { ...x, product_id: row.product_id, pick_label: row.pick_label }
                        : x,
                    ),
                  );
                }}
              />
            </div>
            <div className="md:col-span-2">
              <Label>{t('orders.form.qty')}</Label>
              <Input
                type="number"
                min={1}
                value={ln.qty}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) || 1 } : x)),
                  )
                }
              />
            </div>
            <div className="md:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
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
          onClick={() => setLines((prev) => [...prev, newLine()])}
        >
          <Plus className="me-2 size-4" />
          {t('orders.form.add_line')}
        </Button>
        </div>
      </SectionCard>

      <SectionCard title={t('orders.form.notes')}>
        <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </SectionCard>

      <div className="flex flex-wrap items-center justify-start gap-2 border-t pt-4">
        <Button type="button" onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending}>
          {t('orders.form.save_draft')}
        </Button>
        {variant === 'dialog' && onDismiss ? (
          <Button type="button" variant="outline" onClick={onDismiss} disabled={saveDraft.isPending}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
        ) : null}
        {!isNew && !Number.isNaN(poId) ? (
          <Button
            type="button"
            variant="outline"
            className={cn(poGoldOutlineButtonClass)}
            disabled={send.isPending || existing?.status !== 'draft'}
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
        title={isNew ? t('orders.new') : t('orders.edit')}
        actions={<BackButton to="/purchasing/orders" label={t('orders.title')} />}
      />
      <div className="me-auto flex w-full max-w-6xl flex-col gap-4">{formBody}</div>
    </div>
  );
}
