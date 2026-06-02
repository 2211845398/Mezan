import { useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { UserPlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { getApiErrorMessage, notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { getBranchDisplayName } from '@/features/admin/lib/branchLabels';
import { useMe, useMyBranch } from '@/features/auth/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { customerDetailQueryOptions, crmKeys } from '@/features/crm/queries';
import { useOnline } from '@/hooks/useOnline';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { addCartLine, addShiftCashEvent, changeCartState, getCart, type CartRead } from '../api';
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
  shiftId: number;
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
  shiftId,
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
  const [pendingExchangeCredit, setPendingExchangeCredit] = useState<Decimal | null>(null);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [variantPickerProduct, setVariantPickerProduct] = useState<ProductRead | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [numpadBuffer, setNumpadBuffer] = useState('');
  const addLine = useAddLine(cartId);
  /** Serialize add-line calls so each POST sees the previous response (avoids stale absolute qty races). */
  const addLineChainRef = useRef(Promise.resolve());
  useEffect(() => {
    addLineChainRef.current = Promise.resolve();
  }, [cartId]);

  useEffect(() => {
    setSelectedLineId(null);
    setNumpadBuffer('');
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
    setPendingExchangeCredit(null);
    setSelectedLineId(null);
    setNumpadBuffer('');
    const cached = qc.getQueryData<CartRead>(cartKeys.detail(cartId));
    if (cached?.status !== 'checkout_locked') return;
    try {
      await cancelCart.mutateAsync();
    } catch (error) {
      notifyApiError(error);
    }
  }, [cancelCart, cartId, qc]);

  function onSelectCartLine(lineId: number | null) {
    setSelectedLineId(lineId);
    if (lineId == null) {
      setNumpadBuffer('');
      return;
    }
    const line = cart?.lines?.find((l) => l.id === lineId);
    setNumpadBuffer(line != null ? String(line.qty) : '');
  }

  function applyNumpadToLine() {
    if (!cart?.lines?.length || selectedLineId == null) return;
    const line = cart.lines.find((l) => l.id === selectedLineId);
    if (!line) return;
    const parsed = Number.parseFloat(numpadBuffer);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    let nextQty = Math.round(parsed);
    const returnMeta = returnExchangeSession
      ? Object.values(returnExchangeSession.loads).find(
          (m) => m.productId === line.product_id && m.variantId === (line.variant_id ?? 0),
        )
      : undefined;
    if (returnMeta?.qtyLoaded != null) {
      nextQty = Math.min(returnMeta.qtyLoaded, nextQty);
    }
    void updateQty
      .mutateAsync({
        line_id: line.id,
        product_id: line.product_id,
        variant_id: line.variant_id ?? 0,
        qty: nextQty,
      })
      .catch((error) => notifyApiError(error));
    setNumpadBuffer('');
    setSelectedLineId(null);
  }

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
      const returnLineMetas: ReturnExchangeSession['loads'][number][] = [];
      for (const [idStr, meta] of Object.entries(returnExchangeSession.loads)) {
        const salesInvoiceLineId = Number.parseInt(idStr, 10);
        const cartLn = fresh.lines?.find(
          (l) => l.product_id === meta.productId && l.variant_id === meta.variantId,
        );
        const current = cartLn ? Number(cartLn.qty) : 0;
        const retQty = Math.max(0, current);
        if (retQty === 0) continue;
        linesPayload.push({ sales_invoice_line_id: salesInvoiceLineId, qty: retQty });
        returnLineMetas.push(meta);
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
      onReturnCredit(model);

      for (const meta of returnLineMetas) {
        await addCartLine(cartId, {
          product_id: meta.productId,
          variant_id: meta.variantId,
          qty: 0,
        });
      }
      const cartAfter = await getCart(cartId);
      qc.setQueryData(cartKeys.detail(cartId), cartAfter);
      onReturnExchangeSessionChange(null);

      const creditDec = new Decimal(res.total_amount);
      const hasExchangeLines = (cartAfter.lines ?? []).some((ln) => Number(ln.qty) > 0);

      if (hasExchangeLines) {
        setPendingExchangeCredit(creditDec);
        await addLineChainRef.current;
        if (cartAfter.status === 'active' && canUpdateCart) {
          await lock.mutateAsync();
          const locked = await getCart(cartId);
          qc.setQueryData(cartKeys.detail(cartId), locked);
        }
        setTenderOpen(true);
        return;
      }

      if (creditDec.greaterThan(0)) {
        await addShiftCashEvent(shiftId, {
          event_type: 'cash_out',
          amount: creditDec.toFixed(2),
          note: `CRN ${res.credit_number}`,
        });
      }
      await cancelCart.mutateAsync();
      await onOpenFreshCart({ dropDetailFor: cartId });
    } catch (error) {
      notifyApiError(error);
    }
  }

  async function openCheckout() {
    setPendingExchangeCredit(null);
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
      <div className="grid h-full min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(calc(24rem_-_50px),2.35fr)_minmax(calc(13rem_+_50px),1.32fr)_minmax(0,2.85fr)] xl:grid-rows-[minmax(0,1fr)] xl:items-stretch xl:gap-4 xl:overflow-hidden">
        <RegisterCartColumn
          cart={cart}
          editable={editable}
          isLocked={isLocked}
          transactionsInShift={transactionsInShift}
          onQtyChange={(lineId, productId, variantId, qty) => {
            void updateQty
              .mutateAsync({ line_id: lineId, product_id: productId, variant_id: variantId, qty })
              .catch((error) => notifyApiError(error));
            if (selectedLineId === lineId) {
              setNumpadBuffer(String(qty));
            }
          }}
          currency={POS_CURRENCY}
          returnSession={returnExchangeSession?.loads ?? null}
          selectedLineId={selectedLineId}
          onSelectLine={onSelectCartLine}
          numpadBuffer={numpadBuffer}
          onNumpadBufferChange={setNumpadBuffer}
          onNumpadApply={applyNumpadToLine}
          onNumpadClear={() => setNumpadBuffer('')}
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
        exchangeCredit={pendingExchangeCredit}
        shiftId={shiftId}
        onAbortCheckout={abortCheckoutIfLocked}
        onDone={(result) => {
          setPendingExchangeCredit(null);
          if (result.kind === 'exchange_refund') {
            onTenderDone(result);
            void (async () => {
              await cancelCart.mutateAsync();
              await onOpenFreshCart({ dropDetailFor: cartId });
            })();
            return;
          }
          onTenderDone(result);
        }}
      />
    </div>
  );
}

export default function PosRegister() {
  const { t } = useTranslation('pos');
  const { t: tc } = useTranslation('common');
  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId ?? user?.branch_id ?? null);
  const { data: me } = useMe();
  const branchNameHint = me?.branch_name?.trim() || user?.branch_name?.trim();
  const { data: myBranch } = useMyBranch({
    enabled: activeBranchId != null && !branchNameHint,
  });

  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const { data: shift, isError: shiftError, isLoading: shiftLoading } = useCurrentShift(terminalId);
  const branchIdForDisplay = shift?.branch_id ?? activeBranchId;
  const branchLabel = getBranchDisplayName(
    undefined,
    branchIdForDisplay,
    branchNameHint || myBranch?.name,
  );
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
    if (result.kind === 'exchange_refund') {
      setReceiptModel(result.model);
      setReceiptCredit(true);
      setReceiptOpen(true);
      void openFreshCartAfterSessionEnd();
      return;
    }
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
    void qc.invalidateQueries({ queryKey: ['parked-carts'] });
    await openFreshCartAfterSessionEnd();
  }

  function resumeCart(cartId: number) {
    void changeCartState(cartId, { action: 'resume' })
      .then((cart) => {
        // `useCart` uses infinite staleTime; without this, a resumed cart keeps cached `parked` → UI stays read-only.
        qc.setQueryData(cartKeys.detail(cart.id), cart);
        setActiveCartId(cart.id);
        void qc.invalidateQueries({ queryKey: ['parked-carts'] });
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
            shiftId={shift.id}
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
