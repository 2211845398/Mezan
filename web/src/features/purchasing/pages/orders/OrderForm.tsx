import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { notifyApiError } from '@/api/errorMessages';
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
import { listProducts } from '@/features/catalog/api';
import { catalogKeys } from '@/features/catalog/queries';
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
};

function newLine(): LineDraft {
  return { key: crypto.randomUUID(), product_id: 0, qty: 1 };
}

type ReorderLocationState = {
  reorderLines?: Array<{ product_id: number; qty: number; unit_cost?: string }>;
};

export type OrderFormProps = {
  variant?: 'page' | 'dialog';
  onDismiss?: () => void;
};

export default function OrderForm({ variant = 'page', onDismiss }: OrderFormProps = {}) {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('purchasing');
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
  const { data: products = [] } = useQuery({
    queryKey: catalogKeys.products({ limit: 500, offset: 0, status: 'active' }),
    queryFn: () => listProducts({ limit: 500, offset: 0, status: 'active' }),
  });
  const { data: branches = [] } = useQuery({
    queryKey: adminKeys.branches(false),
    queryFn: () => listBranches({ include_archived: false }),
  });

  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  useEffect(() => {
    reorderAppliedRef.current = false;
  }, [location.pathname, variant]);

  useEffect(() => {
    if (!isNew || reorderAppliedRef.current) {
      return;
    }
    const st = (location.state as ReorderLocationState | null)?.reorderLines;
    if (!st?.length) {
      return;
    }
    reorderAppliedRef.current = true;
    setLines(
      st.map((ln) => ({
        key: crypto.randomUUID(),
        product_id: ln.product_id,
        qty: ln.qty,
      })),
    );
    navigate('.', { replace: true, state: {} });
  }, [isNew, location.state, navigate]);

  useEffect(() => {
    if (!existing) {
      return;
    }
    setSupplierId(existing.supplier_id != null ? String(existing.supplier_id) : '');
    setSupplierName(existing.supplier_name);
    setBranchId(existing.branch_id != null ? String(existing.branch_id) : '');
    setExpectedDate(existing.expected_at ? existing.expected_at.slice(0, 10) : '');
    setNotes(existing.notes ?? '');
    setLines(
      (existing.lines ?? []).map((ln) => ({
        key: String(ln.id),
        product_id: ln.product_id,
        qty: ln.qty,
      })),
    );
  }, [existing]);

  useEffect(() => {
    if (!supplierId) {
      return;
    }
    const s = suppliers.find((x) => x.id === Number(supplierId));
    if (s) {
      setSupplierName(formatPersonName(s.first_name, s.father_name, s.family_name).trim() || '—');
    }
  }, [supplierId, suppliers]);

  const supplierCurrencyId = useMemo(() => {
    if (!supplierId) return null;
    return suppliers.find((s) => s.id === Number(supplierId))?.currency_id ?? null;
  }, [supplierId, suppliers]);

  const buildPayloadLines = (): PurchaseOrderLineCreate[] =>
    lines
      .filter((l) => l.product_id > 0 && l.qty > 0)
      .map(({ product_id, qty }) => ({
        product_id,
        qty,
        unit_cost: '0' as PurchaseOrderLineCreate['unit_cost'],
      }));

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payloadLines = buildPayloadLines();
      const expected_at =
        expectedDate.trim() === ''
          ? null
          : toISOStringUtc(fromISO(`${expectedDate}T00:00:00.000Z`));
      if (isNew) {
        return createPurchaseOrder({
          supplier_name: supplierName.trim() || '—',
          supplier_id: supplierId ? Number(supplierId) : null,
          branch_id: branchId ? Number(branchId) : null,
          notes: notes.trim() || null,
          expected_at,
          lines: payloadLines,
        });
      }
      return updatePurchaseOrder(poId, {
        supplier_name: supplierName.trim() || '—',
        supplier_id: supplierId ? Number(supplierId) : null,
        branch_id: branchId ? Number(branchId) : null,
        notes: notes.trim() || null,
        expected_at,
        lines: payloadLines,
      });
    },
    onMutate: async () => {
      if (isNew || Number.isNaN(poId)) {
        return {};
      }
      await qc.cancelQueries({ queryKey: purchasingKeys.order(poId) });
      const prev = qc.getQueryData<PurchaseOrderRead>(purchasingKeys.order(poId));
      if (!prev) {
        return {};
      }
      const payloadLines = buildPayloadLines();
      const expected_at =
        expectedDate.trim() === ''
          ? null
          : toISOStringUtc(fromISO(`${expectedDate}T00:00:00.000Z`));
      const optimisticLines: PurchaseOrderLineRead[] = payloadLines.map((pl, i) => ({
        id: prev.lines?.[i]?.id ?? -(i + 1),
        product_id: pl.product_id,
        qty: pl.qty,
        unit_cost: '0',
      }));
      const optimistic: PurchaseOrderRead = {
        ...prev,
        supplier_name: supplierName.trim() || '—',
        supplier_id: supplierId ? Number(supplierId) : null,
        branch_id: branchId ? Number(branchId) : null,
        notes: notes.trim() || null,
        expected_at,
        lines: optimisticLines,
      };
      qc.setQueryData(purchasingKeys.order(poId), optimistic);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      const snap = ctx as { prev?: PurchaseOrderRead } | undefined;
      if (snap?.prev && !Number.isNaN(poId)) {
        qc.setQueryData(purchasingKeys.order(poId), snap.prev);
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
      if (isNew || Number.isNaN(poId)) {
        throw new Error('save first');
      }
      const payloadLines = buildPayloadLines();
      const expected_at =
        expectedDate.trim() === ''
          ? null
          : toISOStringUtc(fromISO(`${expectedDate}T00:00:00.000Z`));
      await updatePurchaseOrder(poId, {
        supplier_name: supplierName.trim() || '—',
        supplier_id: supplierId ? Number(supplierId) : null,
        branch_id: branchId ? Number(branchId) : null,
        notes: notes.trim() || null,
        expected_at,
        lines: payloadLines,
      });
      const idem = newIdempotencyKey();
      return sendPurchaseOrder(poId, { idempotency_key: idem }, idem);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: purchasingKeys.root });
      toast.success(t('orders.form.sent_toast'));
      navigate(`/purchasing/orders/${poId}`);
    },
    onError: (error) => notifyApiError(error, t('errors.generic')),
  });

  return (
    <div className={cn('flex flex-col gap-4', variant === 'page' ? 'p-4' : '')}>
      {variant === 'page' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{isNew ? t('orders.new') : t('orders.edit')}</h1>
          <Button type="button" variant="outline" asChild>
            <Link to="/purchasing/orders">{t('orders.title')}</Link>
          </Button>
        </div>
      ) : null}

      <div className={cn('grid w-full gap-4', variant === 'page' ? 'max-w-3xl' : '')}>
        <div className="grid gap-2">
          <Label>{t('orders.form.supplier')}</Label>
          <Select value={supplierId || '__none'} onValueChange={(v) => setSupplierId(v === '__none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {formatPersonName(s.first_name, s.father_name, s.family_name) || s.code} ({s.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!supplierId ? (
          <div className="grid gap-2">
            <Label htmlFor="supplier_name">{t('orders.form.supplier_name')}</Label>
            <Input id="supplier_name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          </div>
        ) : null}
        {supplierCurrencyId != null ? (
          <p className="text-sm text-muted-foreground">
            {t('orders.form.supplier_currency')}: {supplierCurrencyId}
          </p>
        ) : null}
        <div className="grid gap-2">
          <Label>{t('orders.form.branch')}</Label>
          <Select value={branchId || '__none'} onValueChange={(v) => setBranchId(v === '__none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder={t('orders.form.branch_hint')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>{t('orders.form.expected_date')}</Label>
          <DateField value={expectedDate} onChange={setExpectedDate} />
        </div>

        <div className="space-y-2">
          <div className="font-medium">{t('orders.form.lines')}</div>
          {lines.map((ln, idx) => (
            <div key={ln.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-12 md:items-end">
              <div className="md:col-span-7">
                <Label>{t('orders.form.product')}</Label>
                <Select
                  value={ln.product_id ? String(ln.product_id) : '__none'}
                  onValueChange={(v) => {
                    const pid = v === '__none' ? 0 : Number(v);
                    setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, product_id: pid } : x)));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.sku} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
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
            onClick={() => setLines((prev) => [...prev, newLine()])}
          >
            <Plus className="me-2 size-4" />
            {t('orders.form.add_line')}
          </Button>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notes">{t('orders.form.notes')}</Label>
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending}>
            {t('orders.form.save_draft')}
          </Button>
          {variant === 'dialog' && onDismiss ? (
            <Button type="button" variant="ghost" onClick={onDismiss} disabled={saveDraft.isPending}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
          ) : null}
          {!isNew && !Number.isNaN(poId) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={send.isPending || existing?.status !== 'draft'}
              onClick={() => void send.mutateAsync()}
            >
              {t('orders.form.send')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
