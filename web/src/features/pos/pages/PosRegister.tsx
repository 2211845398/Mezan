import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { getApiErrorMessage, notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { useBranch } from '@/features/admin/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { customerDetailQueryOptions, crmKeys } from '@/features/crm/queries';
import { useOnline } from '@/hooks/useOnline';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { changeCartState, getCart, type CartRead } from '../api';
import { thermalModelFromCreditNote } from '../print/mapModel';
import { CustomerPicker } from '../components/CustomerPicker';
import { PosQuickAddCustomerDialog } from '../components/PosQuickAddCustomerDialog';
import { ProductGrid } from '../components/ProductGrid';
import { PosVariantPickerDialog } from '../components/PosVariantPickerDialog';
import type { ProductRead } from '@/features/catalog/api';
import { ReceiptModal } from '../components/ReceiptModal';
import { RegisterCartColumn } from '../components/RegisterCartColumn';
import { PosDrawerMovementDialog } from '../components/PosDrawerMovementDialog';
import { RegisterToolbar } from '../components/RegisterToolbar';
import { RegisterTotalsColumn } from '../components/RegisterTotalsColumn';
import { ReturnDrawer, type ReturnExchangeSession } from '../components/ReturnDrawer';
import { type TenderDone, TenderDrawer } from '../components/TenderDrawer';
import type { ThermalReceiptModel } from '../print/types';
import {
  cartKeys,
  useAddLine,
  useApplyDiscount,
  useCart,
  useCancelCart,
  useCreateCart,
  useCurrentShift,
  useLockCart,
  useParkCart,
  useParkedCarts,
  useSubmitReturnMutation,
  useUpdateCartCustomer,
  useUpdateLineQty,
} from '../queries';
import { usePosRegisterStore } from '../stores/posRegisterStore';
import { usePosTerminalStore } from '../stores/posTerminalStore';

const POS_CURRENCY = 'USD';

/** Fails if `promise` does not settle within `ms` (avoids stuck bootstrap when the network hangs). */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

const CREATE_CART_BOOTSTRAP_MS = 28_000;

type RegisterSessionProps = {
  cartId: number;
  terminalId: number;
  branchLabel: string;
  /** Branch for POS product grid stock filter (shift branch). */
  posBranchId: number;
  /** Paid carts this shift (`/pos/shifts/current` → `transactions_in_shift`). */
  transactionsInShift: number;
  parkedCount: number;
  /** Create a new empty cart and switch to it (avoids long null + loading gap after park/cancel). */
  onOpenFreshCart: (opts?: { dropDetailFor?: number | null }) => Promise<void>;
  onTenderDone: (result: TenderDone) => void;
  onCartMissing: () => void;
  onShowParked: () => void;
  returnExchangeSession: ReturnExchangeSession | null;
  onReturnExchangeSessionChange: (session: ReturnExchangeSession | null) => void;
  onReturnCredit: (model: ThermalReceiptModel) => void;
  canReturn: boolean;
};

function RegisterSession({
  cartId,
  terminalId: _terminalId,
  branchLabel,
  posBranchId,
  transactionsInShift,
  parkedCount,
  onOpenFreshCart,
  onTenderDone,
  onCartMissing,
  onShowParked,
  returnExchangeSession,
  onReturnExchangeSessionChange,
  onReturnCredit,
  canReturn,
}: RegisterSessionProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();
  const { data: cart, isError: cartError, isLoading: cartLoading } = useCart(cartId);

  const canUpdateCart = usePermission('pos_carts', 'update');
  const canDiscount = usePermission('pos_carts', 'discount');
  const canPayCreate = usePermission('pos_payments', 'create');
  const canPayCapture = usePermission('pos_payments', 'capture');
  const canPay = canPayCreate && canPayCapture;
  const canInvoice = usePermission('sales_invoices', 'create');
  const canCreateCustomer = usePermission('customers', 'create');

  const [tenderOpen, setTenderOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [variantPickerProduct, setVariantPickerProduct] = useState<ProductRead | null>(null);

  const addLine = useAddLine(cartId);
  /** Serialize add-line calls so each POST sees the previous response (avoids stale absolute qty races). */
  const addLineChainRef = useRef(Promise.resolve());
  useEffect(() => {
    addLineChainRef.current = Promise.resolve();
  }, [cartId]);
  const updateQty = useUpdateLineQty(cartId);
  const applyDisc = useApplyDiscount(cartId);
  const lock = useLockCart(cartId);
  const parkCart = useParkCart(cartId);
  const cancelCart = useCancelCart(cartId);
  const updateCustomer = useUpdateCartCustomer(cartId);
  const qc = useQueryClient();

  const cartCustomerId = cart?.customer_id ?? null;
  const customerLoyaltyQuery = useQuery({
    ...customerDetailQueryOptions(cartCustomerId ?? 0),
    enabled: cartCustomerId != null && cartCustomerId > 0,
  });
  const customerLoyaltyBalance =
    cartCustomerId == null
      ? null
      : customerLoyaltyQuery.isSuccess
        ? customerLoyaltyQuery.data.loyalty_balance
        : null;
  const submitReturnMut = useSubmitReturnMutation();

  const abortCheckoutIfLocked = useCallback(async () => {
    const cached = qc.getQueryData<CartRead>(cartKeys.detail(cartId));
    if (cached?.status !== 'checkout_locked') return;
    try {
      await cancelCart.mutateAsync();
    } catch (error) {
      notifyApiError(error);
    }
  }, [cancelCart, cartId, qc]);

  function onAddLine(productId: number, qty = 1, variantId?: number) {
    const pid = productId;
    if (!Number.isFinite(pid)) return;
    addLineChainRef.current = addLineChainRef.current
      .then(async () => {
        await addLine.mutateAsync({
          product_id: pid,
          qty,
          ...(variantId != null && variantId > 0 ? { variant_id: variantId } : {}),
        });
      })
      .catch((e) => {
        notify.error(getApiErrorMessage(e));
      });
  }

  if (cartError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 text-center text-sm shadow-sm">
        <p className="text-muted-foreground">{t('register.cart_error_title')}</p>
        <Button type="button" variant="outline" onClick={() => onCartMissing()}>
          {t('register.retry_cart')}
        </Button>
      </div>
    );
  }

  if (cartLoading || !cart) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
        <p className="font-medium text-foreground">{t('register.loading_cart')}</p>
        <Button type="button" variant="outline" onClick={() => void onCartMissing()}>
          {t('register.retry_cart')}
        </Button>
      </div>
    );
  }

  const activeCart = cart;
  const editable = activeCart.status === 'active' && canUpdateCart;
  const isLocked = activeCart.status === 'checkout_locked';

  const canRegisterReturn =
    online && canReturn && editable && activeCart.status === 'active' && returnExchangeSession != null;

  async function registerReturn() {
    if (!returnExchangeSession) return;
    try {
      await addLineChainRef.current;
      const fresh = await getCart(cartId);
      const linesPayload: { sales_invoice_line_id: number; qty: number }[] = [];
      for (const [idStr, meta] of Object.entries(returnExchangeSession.loads)) {
        const salesInvoiceLineId = Number.parseInt(idStr, 10);
        const cartLn = fresh.lines?.find(
          (l) => l.product_id === meta.productId && l.variant_id === meta.variantId,
        );
        const current = cartLn ? Number(cartLn.qty) : 0;
        const retQty = Math.max(0, meta.qtyLoaded - current);
        if (retQty > 0) {
          linesPayload.push({ sales_invoice_line_id: salesInvoiceLineId, qty: retQty });
        }
      }
      if (!linesPayload.length) {
        notify.error(t('return.none_return_qty'));
        return;
      }
      const res = await submitReturnMut.mutateAsync({
        invoice_barcode: returnExchangeSession.invoiceBarcode,
        reason: null,
        lines: linesPayload,
        exchange_cart_id: cartId,
      });
      const model = thermalModelFromCreditNote({
        branchLabel,
        currency: POS_CURRENCY,
        creditNumber: res.credit_number,
        total: res.total_amount,
        lines: linesPayload.map((p) => {
          const meta = returnExchangeSession.loads[p.sales_invoice_line_id];
          return {
            name: meta?.productName ?? '',
            qty: p.qty,
            unitPrice: '0',
            lineTotal: '0',
            taxAmount: '0',
          };
        }),
      });
      notify.success(t('return.credit_note', { id: res.credit_note_id }));
      onReturnExchangeSessionChange(null);
      onReturnCredit(model);
      // Any extra catalog lines still in the cart are discarded; cancel + fresh empty slate.
      await cancelCart.mutateAsync();
      await onOpenFreshCart({ dropDetailFor: cartId });
    } catch (error) {
      notifyApiError(error);
    }
  }

  async function openCheckout() {
    const hasPayableLines = (activeCart.lines ?? []).some((ln) => (ln.qty ?? 0) > 0);
    if (!hasPayableLines) {
      notify.info(t('register.cart_empty'));
      return;
    }
    if (activeCart.status === 'active' && canUpdateCart) {
      try {
        /** Wait for any in-flight optimistic line POSTs to settle before locking, so server-side recalc reflects every line. */
        await addLineChainRef.current;
        await lock.mutateAsync();
        /** Force-refresh from server because `useCart` has staleTime=Infinity and won't auto-refetch. */
        const fresh = await getCart(cartId);
        qc.setQueryData(cartKeys.detail(cartId), fresh);
      } catch (error) {
        notifyApiError(error);
        return;
      }
    }
    setTenderOpen(true);
  }

  async function handlePark() {
    const hasPayableLines = (activeCart.lines ?? []).some((ln) => (ln.qty ?? 0) > 0);
    if (!hasPayableLines) {
      notify.info(t('register.cart_empty'));
      return;
    }
    try {
      await parkCart.mutateAsync();
      await onOpenFreshCart();
    } catch (error) {
      notifyApiError(error);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(calc(24rem_-_50px),2.35fr)_minmax(calc(13rem_+_50px),1.32fr)_minmax(0,2.85fr)] xl:grid-rows-1 xl:gap-4 xl:overflow-hidden">
        <RegisterCartColumn
          cart={cart}
          editable={editable}
          isLocked={isLocked}
          transactionsInShift={transactionsInShift}
          onQtyChange={(lineId, productId, variantId, qty) => {
            void updateQty
              .mutateAsync({ line_id: lineId, product_id: productId, variant_id: variantId, qty })
              .catch((error) => notifyApiError(error));
          }}
          currency={POS_CURRENCY}
        />
        <RegisterTotalsColumn
          cart={cart}
          currency={POS_CURRENCY}
          canDiscount={canDiscount}
          canUpdateCart={canUpdateCart}
          canPay={canPay}
          canInvoice={canInvoice}
          editable={editable}
          isLocked={isLocked}
          parkedCount={parkedCount}
          returnModeActive={returnExchangeSession != null}
          canRegisterReturn={canRegisterReturn}
          returnSubmitPending={submitReturnMut.isPending}
          onRegisterReturn={() => void registerReturn()}
          customerLoyaltyBalance={customerLoyaltyBalance}
          onApplyDiscount={async (body) => {
            try {
              await applyDisc.mutateAsync(body);
              if (cartCustomerId) {
                void qc.invalidateQueries({ queryKey: crmKeys.customer(cartCustomerId) });
              }
            } catch (error) {
              notifyApiError(error);
            }
          }}
          onCheckout={() => void openCheckout()}
          onPark={() => void handlePark()}
          onNewCart={() => void handlePark()}
          onShowParked={onShowParked}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 px-0.5 pt-2 sm:px-1">
          <div className="flex shrink-0 gap-2">
            <div className="min-w-0 flex-1">
              <CustomerPicker
                value={(cart as typeof cart & { customer_id?: number | null }).customer_id ?? null}
                disabled={!editable}
                onChange={async (customerId) => {
                  await updateCustomer.mutateAsync(customerId);
                }}
              />
            </div>
            {canCreateCustomer ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={cart.status !== 'active'}
                onClick={() => setAddCustomerOpen(true)}
                aria-label={t('register.add_customer')}
              >
                <UserPlus className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
          <PosQuickAddCustomerDialog
            open={addCustomerOpen}
            onOpenChange={setAddCustomerOpen}
            onCreated={async (customerId) => {
              await updateCustomer.mutateAsync(customerId);
            }}
          />
          <ProductGrid
            disabled={!editable}
            branchId={posBranchId}
            inStockOnly
            onAddProduct={(productId, qty) => void onAddLine(productId, qty)}
            onPickProductWithVariants={(product) => setVariantPickerProduct(product)}
          />
          <PosVariantPickerDialog
            open={variantPickerProduct != null}
            productId={variantPickerProduct?.id ?? null}
            productName={variantPickerProduct?.name ?? ''}
            branchId={posBranchId}
            onOpenChange={(open) => {
              if (!open) setVariantPickerProduct(null);
            }}
            onSelectVariant={(variantId) => {
              const p = variantPickerProduct;
              if (p) void onAddLine(p.id, 1, variantId);
              setVariantPickerProduct(null);
            }}
          />
        </div>
      </div>

      <TenderDrawer
        open={tenderOpen}
        onOpenChange={setTenderOpen}
        cart={cart}
        currency={POS_CURRENCY}
        branchLabel={branchLabel}
        customerId={(cart as typeof cart & { customer_id?: number | null }).customer_id ?? null}
        onAbortCheckout={abortCheckoutIfLocked}
        onDone={onTenderDone}
      />
    </div>
  );
}

export default function PosRegister() {
  const { t } = useTranslation('pos');
  const { t: tc } = useTranslation('common');
  const activeBranchId = useAuthStore((s) => s.activeBranchId ?? s.user?.branch_id ?? null);
  const { data: activeBranch } = useBranch(activeBranchId ?? 0, {
    enabled: activeBranchId != null && activeBranchId > 0,
  });
  const branchLabel =
    activeBranch?.name?.trim() ||
    (activeBranchId != null ? tc('layout.branch_context', { id: activeBranchId }) : '');

  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const { data: shift, isError: shiftError, isLoading: shiftLoading } = useCurrentShift(terminalId);
  const { activeCartId, setActiveCartId } = usePosRegisterStore();
  const qc = useQueryClient();

  const createCartMut = useCreateCart();
  const createCartMutRef = useRef(createCartMut);
  createCartMutRef.current = createCartMut;
  const creatingCartRef = useRef(false);

  const openFreshCartAfterSessionEnd = useCallback(
    async (opts?: { dropDetailFor?: number | null }) => {
      if (!shift?.id || !terminalId) return;
      if (creatingCartRef.current) return;
      creatingCartRef.current = true;
      setCartCreateError(null);
      try {
        const c = await withTimeout(
          createCartMutRef.current.mutateAsync({
            terminal_id: terminalId,
            shift_id: shift.id,
            customer_id: null,
          }),
          CREATE_CART_BOOTSTRAP_MS,
          tc('errors.request_timeout'),
        );
        setActiveCartId(c.id);
        if (opts?.dropDetailFor != null) {
          qc.removeQueries({ queryKey: cartKeys.detail(opts.dropDetailFor) });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setCartCreateError(message);
        setActiveCartId(null);
        notify.error(message);
      } finally {
        creatingCartRef.current = false;
      }
    },
    [qc, setActiveCartId, shift?.id, tc, terminalId],
  );

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptModel, setReceiptModel] = useState<ThermalReceiptModel | null>(null);
  const [receiptCredit, setReceiptCredit] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnExchangeSession, setReturnExchangeSession] = useState<ReturnExchangeSession | null>(null);
  const [cartCreateError, setCartCreateError] = useState<string | null>(null);
  const [cartRetryNonce, setCartRetryNonce] = useState(0);

  // Parked invoices dialog — lifted so both toolbar and totals column can open it
  const [parkedOpen, setParkedOpen] = useState(false);
  const [drawerMovementOpen, setDrawerMovementOpen] = useState(false);
  const canShiftLedgerActions = usePermission('pos_shifts', 'update');
  const canReturn = usePermission('returns', 'create');

  // Parked carts for badge count (fetched here so both toolbar & totals column share the same data)
  const parkedCarts = useParkedCarts(terminalId ?? 0);
  const parkedCount = parkedCarts.data?.length ?? 0;

  // Active cart (cached by TanStack Query — no extra network round-trip)
  const { data: activeCart } = useCart(activeCartId);
  const activeCartHasLines = (activeCart?.lines?.length ?? 0) > 0;

  useEffect(() => {
    setReturnExchangeSession(null);
  }, [activeCartId]);

  useEffect(() => {
    if (!shift?.id || !terminalId) return;
    if (activeCartId != null) return;
    if (cartCreateError || creatingCartRef.current) return;
    let cancelled = false;
    creatingCartRef.current = true;
    void (async () => {
      try {
        const c = await withTimeout(
          createCartMutRef.current.mutateAsync({
            terminal_id: terminalId,
            shift_id: shift.id,
            customer_id: null,
          }),
          CREATE_CART_BOOTSTRAP_MS,
          tc('errors.request_timeout'),
        );
        if (!cancelled) setActiveCartId(c.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) setCartCreateError(message);
        notify.error(message);
      } finally {
        creatingCartRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    shift?.id,
    terminalId,
    activeCartId,
    cartCreateError,
    cartRetryNonce,
    setActiveCartId,
    tc,
  ]);

  if (!terminalId) {
    return <Navigate to="/pos" replace />;
  }
  if (shiftLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#f8f7f4] p-4">
        <div className="rounded-2xl border bg-card px-6 py-5 text-sm text-muted-foreground shadow-sm">
          {t('register.loading_shift')}
        </div>
      </div>
    );
  }
  if (shiftError) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#f8f7f4] p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold">{t('register.shift_error_title')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('register.need_shift')}</p>
          <Button asChild className="mt-5">
            <Link to="/pos">{t('shell.nav_gate')}</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!shift) {
    return <Navigate to="/pos" replace />;
  }

  function onTenderDone(result: TenderDone) {
    setReceiptModel(result.model);
    setReceiptCredit(false);
    setReceiptOpen(true);
    if (result.kind === 'invoice') {
      void openFreshCartAfterSessionEnd();
    }
  }

  function resetCartAndRetry() {
    creatingCartRef.current = false;
    setCartCreateError(null);
    setActiveCartId(null);
    setCartRetryNonce((n) => n + 1);
  }

  async function parkCurrentCart() {
    const id = activeCartId;
    if (id == null) return;
    if (!activeCartHasLines) return;
    await changeCartState(id, { action: 'park' });
    await openFreshCartAfterSessionEnd();
  }

  function resumeCart(cartId: number) {
    void changeCartState(cartId, { action: 'resume' })
      .then((cart) => {
        // `useCart` uses infinite staleTime; without this, a resumed cart keeps cached `parked` → UI stays read-only.
        qc.setQueryData(cartKeys.detail(cart.id), cart);
        setActiveCartId(cart.id);
      })
      .catch((error) => notifyApiError(error));
  }

  return (
    <div
      data-return-mode={returnExchangeSession ? 'exchange' : undefined}
      className={`flex h-full min-h-0 w-full min-w-0 flex-col gap-2 px-2 py-2 transition-colors duration-200 sm:gap-3 sm:px-3 sm:py-3 ${
        returnExchangeSession
          ? 'bg-primary/5 ring-1 ring-primary/15 dark:bg-primary/10 dark:ring-primary/25'
          : 'bg-[#f8f7f4]'
      }`}
    >
      <RegisterToolbar
        onReturnOpen={() => setReturnOpen(true)}
        returnInvoiceNumber={returnExchangeSession?.invoiceNumber ?? null}
        terminalId={terminalId}
        branchLabel={branchLabel}
        currency={POS_CURRENCY}
        activeCartId={activeCartId}
        activeCartHasLines={activeCartHasLines}
        onParkCurrent={parkCurrentCart}
        onResumeCart={resumeCart}
        parkedOpen={parkedOpen}
        onParkedOpenChange={setParkedOpen}
        canDrawerMovement={!!shift?.id && canShiftLedgerActions}
        onDrawerMovementOpen={() => setDrawerMovementOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeCartId && shift ? (
          <RegisterSession
            cartId={activeCartId}
            terminalId={terminalId}
            branchLabel={branchLabel}
            posBranchId={shift.branch_id}
            transactionsInShift={shift.transactions_in_shift ?? 0}
            parkedCount={parkedCount}
            onOpenFreshCart={openFreshCartAfterSessionEnd}
            onTenderDone={onTenderDone}
            onCartMissing={resetCartAndRetry}
            onShowParked={() => setParkedOpen(true)}
            returnExchangeSession={returnExchangeSession}
            onReturnExchangeSessionChange={setReturnExchangeSession}
            onReturnCredit={(model) => {
              setReceiptModel(model);
              setReceiptCredit(true);
              setReceiptOpen(true);
            }}
            canReturn={canReturn}
          />
        ) : cartCreateError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
              <h2 className="text-lg font-semibold">{t('register.cart_error_title')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{cartCreateError}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={resetCartAndRetry}>
                  {t('register.retry_cart')}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/pos">{t('shell.nav_gate')}</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
            <p className="font-medium text-foreground">{t('register.loading_cart')}</p>
            <Button type="button" variant="outline" onClick={resetCartAndRetry}>
              {t('register.retry_cart')}
            </Button>
          </div>
        )}
      </div>

      {shift?.id && terminalId ? (
        <PosDrawerMovementDialog
          open={drawerMovementOpen}
          onOpenChange={setDrawerMovementOpen}
          shiftId={shift.id}
          terminalId={terminalId}
        />
      ) : null}

      <ReturnDrawer
        open={returnOpen}
        onOpenChange={setReturnOpen}
        exchangeCartId={activeCartId}
        exchangeSession={returnExchangeSession}
        onExchangeSessionChange={setReturnExchangeSession}
      />

      {receiptModel ? (
        <ReceiptModal
          open={receiptOpen}
          onOpenChange={(o) => {
            setReceiptOpen(o);
            if (!o) {
              setReceiptModel(null);
            }
          }}
          model={receiptModel}
          creditMode={receiptCredit}
        />
      ) : null}
    </div>
  );
}
