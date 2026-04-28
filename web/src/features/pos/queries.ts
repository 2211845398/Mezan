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
  listSalesInvoices,
  listTerminals,
  lookupReturnInvoice,
  openShift,
  type OpenShiftBody,
  type PaymentCaptureBody,
  type PaymentIntentBody,
  type ReturnBody,
  submitReturn,
  voidSale,
  type VoidSaleBody,
} from './api';

export const shiftKeys = {
  all: ['pos', 'shifts'] as const,
  current: (terminalId: number | null) => [...shiftKeys.all, 'current', terminalId] as const,
} as const;

export const cartKeys = {
  all: ['pos', 'carts'] as const,
  detail: (cartId: number) => [...cartKeys.all, 'detail', cartId] as const,
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
  return createOptimisticMutation<CartRead, LineVars, CartRead | undefined>({
    mutationFn: async (variables) => addCartLine(cartId, variables),
    getSnapshot: (client) => client.getQueryData(cartKeys.detail(cartId)),
    applyOptimistic: (client, variables) => {
      const prev = client.getQueryData<CartRead>(cartKeys.detail(cartId));
      if (!prev) return;
      const synthetic: CartRead = {
        ...prev,
        lines: [
          ...(prev.lines ?? []),
          {
            id: -1,
            product_id: variables.product_id,
            product_name: '',
            product_sku: '',
            barcode: null,
            qty: variables.qty,
            unit_price: '0',
            line_total: '0',
            tax_rate: '0',
            line_tax_amount: '0',
          },
        ],
      };
      client.setQueryData(cartKeys.detail(cartId), synthetic);
    },
    rollback: (client, snap) => {
      if (snap !== undefined) client.setQueryData(cartKeys.detail(cartId), snap);
    },
    invalidate: (client) => {
      void client.invalidateQueries({ queryKey: cartKeys.detail(cartId) });
    },
  })();
}

export function useUpdateLineQty(cartId: number) {
  return createOptimisticMutation<CartRead, LineVars, CartRead | undefined>({
    mutationFn: async (variables) => addCartLine(cartId, variables),
    getSnapshot: (client) => client.getQueryData(cartKeys.detail(cartId)),
    applyOptimistic: (client, variables) => {
      const prev = client.getQueryData<CartRead>(cartKeys.detail(cartId));
      if (!prev?.lines) return;
      const lines = prev.lines.map((ln) =>
        ln.product_id === variables.product_id ? { ...ln, qty: variables.qty } : ln,
      );
      client.setQueryData(cartKeys.detail(cartId), { ...prev, lines });
    },
    rollback: (client, snap) => {
      if (snap !== undefined) client.setQueryData(cartKeys.detail(cartId), snap);
    },
    invalidate: (client) => {
      void client.invalidateQueries({ queryKey: cartKeys.detail(cartId) });
    },
  })();
}

export function useApplyDiscount(cartId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; amount: string }) =>
      applyCartDiscount(cartId, { code: body.code, amount: body.amount }),
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
