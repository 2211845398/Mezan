import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ConflictError, ValidationError } from '@/api/errors';
import { createOptimisticMutation } from '@/api/mutations';
import { now, utcCalendarDayKey } from '@/lib/date';
import { notify } from '@/lib/toast';

import {
  addCartLine,
  addShiftCashEvent,
  applyCartDiscount,
  capturePayment,
  type CartRead,
  type CartDiscountBody,
  changeCartState,
  closeShift,
  createCart,
  type CreateCartBody,
  createPaymentIntent,
  type FinalizeBody,
  finalizeSale,
  getCart,
  getCurrentShift,
  getSalesInvoice,
  listCarts,
  listSalesInvoices,
  listTerminals,
  lookupReturnInvoice,
  openShift,
  type OpenShiftBody,
  type PaymentCaptureBody,
  type PaymentIntentBody,
  type ReturnBody,
  submitReturn,
  updateCartCustomer,
  voidSale,
  type VoidSaleBody,
} from './api';
import {
  catalogListUnitPriceString,
  findProductInCatalogCache,
  pendingOptimisticLinesAfterMerge,
  recalcApproxCartTotals,
} from './cartTotalsApprox';

export const shiftKeys = {
  all: ['pos', 'shifts'] as const,
  current: (terminalId: number | null) => [...shiftKeys.all, 'current', terminalId] as const,
} as const;

export const cartKeys = {
  all: ['pos', 'carts'] as const,
  detail: (cartId: number) => [...cartKeys.all, 'detail', cartId] as const,
  list: (q: Record<string, unknown>) => [...cartKeys.all, 'list', q] as const,
} as const;

export const invoiceKeys = {
  all: ['pos', 'invoices'] as const,
  detail: (invoiceId: number) => [...invoiceKeys.all, 'detail', invoiceId] as const,
  list: (terminalId: number, dayKey: string) =>
    [...invoiceKeys.all, 'list', terminalId, dayKey] as const,
} as const;

export const returnKeys = {
  all: ['pos', 'returns'] as const,
  lookup: (barcode: string) => [...returnKeys.all, 'lookup', barcode] as const,
} as const;

export const terminalKeys = {
  all: ['terminals'] as const,
  branch: (branchId: number) => [...terminalKeys.all, 'branch', branchId] as const,
} as const;

/** Unique temp line ids so list keys never collide during optimistic add-line updates. */
let optimisticCartLineIdSeq = 0;
function nextOptimisticCartLineId(): number {
  optimisticCartLineIdSeq -= 1;
  return optimisticCartLineIdSeq;
}

export function useTerminalsForBranch(branchId: number | null) {
  return useQuery({
    queryKey: branchId != null ? terminalKeys.branch(branchId) : ['terminals', 'none'],
    queryFn: () => listTerminals(branchId!),
    enabled: branchId != null,
    staleTime: 60_000,
  });
}

export function useCurrentShift(terminalId: number | null) {
  return useQuery({
    queryKey: shiftKeys.current(terminalId),
    queryFn: () => getCurrentShift({ terminal_id: terminalId! }),
    enabled: terminalId != null,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useCart(cartId: number | null) {
  return useQuery({
    queryKey: cartId != null ? cartKeys.detail(cartId) : ['pos', 'carts', 'none'],
    queryFn: () => getCart(cartId!),
    enabled: cartId != null,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    /** Avoid long “preparing cart” spinners on 5xx / flaky networks (TanStack default retries). */
    retry: false,
  });
}

export function useParkedCarts(terminalId: number | null) {
  const listParams: Record<string, unknown> =
    terminalId != null
      ? { status: 'parked' as const, terminal_id: terminalId }
      : { status: 'parked' as const };
  return useQuery({
    queryKey: cartKeys.list(listParams),
    queryFn: () => {
      if (terminalId == null) {
        throw new Error('useParkedCarts requires terminalId');
      }
      return listCarts({ status: 'parked', terminal_id: terminalId });
    },
    enabled: terminalId != null,
    staleTime: 15_000,
  });
}

export function useInvoice(invoiceId: number | null) {
  return useQuery({
    queryKey: invoiceId != null ? invoiceKeys.detail(invoiceId) : ['pos', 'invoices', 'none'],
    queryFn: () => getSalesInvoice(invoiceId!),
    enabled: invoiceId != null,
    staleTime: 5 * 60_000,
  });
}

export function useTodayInvoices(terminalId: number | null, businessDate?: string) {
  const dayKey = businessDate ?? utcCalendarDayKey(now());
  return useQuery({
    queryKey: invoiceKeys.list(terminalId ?? 0, dayKey),
    queryFn: () =>
      listSalesInvoices({
        terminal_id: terminalId!,
        business_date: businessDate ?? dayKey,
      }),
    enabled: terminalId != null,
    staleTime: 30_000,
  });
}

export function useReturnLookup(barcode: string | null, enabled: boolean) {
  return useQuery({
    queryKey: returnKeys.lookup(barcode ?? ''),
    queryFn: () => lookupReturnInvoice({ invoice_barcode: barcode! }),
    enabled: Boolean(barcode && enabled),
    staleTime: 0,
  });
}

export function useOpenShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OpenShiftBody) => openShift(body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: shiftKeys.current(vars.terminal_id) });
    },
  });
}

export function useCloseShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shiftId, declaredCash }: { shiftId: number; declaredCash: string }) =>
      closeShift(shiftId, { declared_cash: declaredCash }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: shiftKeys.current(data.terminal_id) });
    },
  });
}

export function useShiftCashEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      shiftId,
      event_type,
      amount,
      note,
    }: {
      shiftId: number;
      event_type: string;
      amount: string;
      note?: string | null;
    }) => addShiftCashEvent(shiftId, { event_type, amount, note: note ?? null }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: shiftKeys.current(data.terminal_id) });
    },
  });
}

export function useCreateCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCartBody) => createCart(body),
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(data.id), data);
    },
  });
}

type LineVars = { product_id: number; qty: number };

export function useAddLine(cartId: number) {
  const qc = useQueryClient();
  return createOptimisticMutation<CartRead, LineVars, CartRead | undefined>({
    /** Backend `upsert_line` treats `qty` as absolute, not a delta — read post-optimistic cart. */
    mutationFn: async (variables, _idempotencyKey) => {
      const cart = qc.getQueryData<CartRead>(cartKeys.detail(cartId));
      const line = cart?.lines?.find((ln) => ln.product_id === variables.product_id);
      const target = line != null ? Number(line.qty) : variables.qty;
      const absQty = Math.max(
        0,
        Number.isFinite(target) ? Math.round(target) : Math.round(variables.qty),
      );
      return addCartLine(cartId, { product_id: variables.product_id, qty: absQty });
    },
    getSnapshot: (client) => client.getQueryData(cartKeys.detail(cartId)),
    applyOptimistic: (client, variables) => {
      const prev = client.getQueryData<CartRead>(cartKeys.detail(cartId));
      if (!prev) return;
      const hit = findProductInCatalogCache(client, variables.product_id);
      const unitPrice = hit ? catalogListUnitPriceString(hit) : '0.00';
      const rateStr = hit ? String(hit.output_vat_rate ?? '0') : '0';
      const prevLines = prev.lines ?? [];
      const existingIdx = prevLines.findIndex((ln) => ln.product_id === variables.product_id);

      let draftLines: NonNullable<CartRead['lines']>;
      if (existingIdx >= 0) {
        // Same as backend upsert_line: bump qty on existing row (avoids duplicate “ghost” card flash).
        draftLines = prevLines.map((ln, i) =>
          i === existingIdx ? { ...ln, qty: Number(ln.qty) + variables.qty } : ln,
        );
      } else {
        const newLine = {
          id: nextOptimisticCartLineId(),
          product_id: variables.product_id,
          variant_id: 0,
          product_name: hit?.name ?? '',
          product_sku: hit?.sku ?? '',
          barcode: hit?.barcode ?? null,
          qty: variables.qty,
          unit_price: unitPrice,
          line_total: '0.00',
          tax_rate: rateStr,
          line_tax_amount: '0.00',
        };
        draftLines = [...prevLines, newLine];
      }
      const r = recalcApproxCartTotals(prev, draftLines);
      client.setQueryData(cartKeys.detail(cartId), { ...prev, ...r });
    },
    rollback: (client, snap) => {
      if (snap !== undefined) client.setQueryData(cartKeys.detail(cartId), snap);
    },
  })({
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(cartId), (current: CartRead | undefined) => {
        if (!current) return data;
        /** Stale line POST may resolve after checkout lock; never clobber locked/paid cache. */
        if (current.status !== 'active') {
          return current;
        }
        const stillPending = pendingOptimisticLinesAfterMerge(current.lines, data.lines);
        const mergedLines = [...(data.lines ?? []), ...stillPending].filter((l) => Number(l.qty) > 0);
        const r = recalcApproxCartTotals(data, mergedLines);
        const merged: CartRead = { ...data, ...r, lines: r.lines };
        return merged;
      });
    },
  });
}

type LineQtyVars = { line_id: number; product_id: number; qty: number };

export function useUpdateLineQty(cartId: number) {
  const qc = useQueryClient();
  return createOptimisticMutation<CartRead, LineQtyVars, CartRead | undefined>({
    mutationFn: async (variables, _idempotencyKey) =>
      addCartLine(cartId, { product_id: variables.product_id, qty: variables.qty }),
    getSnapshot: (client) => client.getQueryData(cartKeys.detail(cartId)),
    applyOptimistic: (client, variables) => {
      const prev = client.getQueryData<CartRead>(cartKeys.detail(cartId));
      if (!prev?.lines) return;
      const linesAfterQty = prev.lines
        .map((ln) => (ln.id === variables.line_id ? { ...ln, qty: variables.qty } : ln))
        .filter((l) => Number(l.qty) > 0);
      const r = recalcApproxCartTotals(prev, linesAfterQty);
      client.setQueryData(cartKeys.detail(cartId), { ...prev, ...r });
    },
    rollback: (client, snap) => {
      if (snap !== undefined) client.setQueryData(cartKeys.detail(cartId), snap);
    },
  })({
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(cartId), (current: CartRead | undefined) => {
        if (!current) return data;
        if (current.status !== 'active') {
          return current;
        }
        const stillPending = pendingOptimisticLinesAfterMerge(current.lines, data.lines);
        const mergedLines = [...(data.lines ?? []), ...stillPending].filter((l) => Number(l.qty) > 0);
        const r = recalcApproxCartTotals(data, mergedLines);
        return { ...data, ...r, lines: r.lines };
      });
    },
  });
}

export function useApplyDiscount(cartId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CartDiscountBody) => applyCartDiscount(cartId, body),
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(cartId), data);
    },
  });
}

export function useParkCart(cartId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => changeCartState(cartId, { action: 'park' }),
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(cartId), data);
      void qc.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'pos' && key[1] === 'carts' && key[2] === 'list';
        },
      });
    },
  });
}

export function useCancelCart(cartId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => changeCartState(cartId, { action: 'cancel' }),
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(cartId), data);
      void qc.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'pos' && key[1] === 'carts' && key[2] === 'list';
        },
      });
    },
  });
}

export function useResumeCart(cartId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => changeCartState(cartId, { action: 'resume' }),
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(cartId), data);
    },
  });
}

export function useUpdateCartCustomer(cartId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customerId: number | null) => updateCartCustomer(cartId, customerId),
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(cartId), data);
    },
  });
}

export function useLockCart(cartId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => changeCartState(cartId, { action: 'lock' }),
    onSuccess: (data) => {
      qc.setQueryData(cartKeys.detail(cartId), data);
    },
  });
}

export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: (body: PaymentIntentBody) => createPaymentIntent(body),
  });
}

export function useCapturePaymentMutation() {
  return useMutation({
    mutationFn: (body: PaymentCaptureBody) => capturePayment(body),
  });
}

export function useFinalizeSaleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FinalizeBody) => finalizeSale(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: invoiceKeys.all });
      void qc.invalidateQueries({ queryKey: shiftKeys.all });
    },
  });
}

export function useVoidSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VoidSaleBody) => voidSale(body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: invoiceKeys.all });
      void qc.invalidateQueries({ queryKey: invoiceKeys.detail(data.id) });
      void qc.invalidateQueries({ queryKey: shiftKeys.all });
    },
  });
}

export function useSubmitReturnMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnBody) => submitReturn(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: invoiceKeys.all });
      void qc.invalidateQueries({ queryKey: returnKeys.all });
      void qc.invalidateQueries({ queryKey: cartKeys.all });
    },
  });
}

export function mapPosErrorToToast(err: unknown, t: (k: string) => string): void {
  if (err instanceof ConflictError) {
    notify.error(t('errors.payment.capture_failed'));
    return;
  }
  if (err instanceof ValidationError) {
    notify.error(err.message);
    return;
  }
  if (err instanceof Error) {
    notify.error(err.message);
  }
}
