import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { getApiErrorMessage, notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { useBranch } from '@/features/admin/queries';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import { changeCartState, type CartRead } from '../api';
import { CustomerPicker } from '../components/CustomerPicker';
import { ProductGrid } from '../components/ProductGrid';
import { ReceiptModal } from '../components/ReceiptModal';
import { RegisterCartColumn } from '../components/RegisterCartColumn';
import { RegisterToolbar } from '../components/RegisterToolbar';
import { RegisterTotalsColumn } from '../components/RegisterTotalsColumn';
import { ReturnDrawer } from '../components/ReturnDrawer';
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
  useUpdateCartCustomer,
  useUpdateLineQty,
} from '../queries';
import { usePosRegisterStore } from '../stores/posRegisterStore';
import { usePosTerminalStore } from '../stores/posTerminalStore';

const POS_CURRENCY = 'USD';

type RegisterSessionProps = {
  cartId: number;
  terminalId: number;
  branchLabel: string;
  /** Paid carts this shift (`/pos/shifts/current` → `transactions_in_shift`). */
  transactionsInShift: number;
  parkedCount: number;
  /** Create a new empty cart and switch to it (avoids long null + loading gap after park/cancel). */
  onOpenFreshCart: (opts?: { dropDetailFor?: number | null }) => Promise<void>;
  onTenderDone: (result: TenderDone) => void;
  onCartMissing: () => void;
  onShowParked: () => void;
};

function RegisterSession({
  cartId,
  terminalId: _terminalId,
  branchLabel,
  transactionsInShift,
  parkedCount,
  onOpenFreshCart,
  onTenderDone,
  onCartMissing,
  onShowParked,
}: RegisterSessionProps) {
  const { t } = useTranslation('pos');
  const { data: cart, isError: cartError, isLoading: cartLoading } = useCart(cartId);

  const canUpdateCart = usePermission('pos_carts', 'update');
  const canDiscount = usePermission('pos_carts', 'discount');
  const canPayCreate = usePermission('pos_payments', 'create');
  const canPayCapture = usePermission('pos_payments', 'capture');
  const canPay = canPayCreate && canPayCapture;
  const canInvoice = usePermission('sales_invoices', 'create');

  const [tenderOpen, setTenderOpen] = useState(false);

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

  const abortCheckoutIfLocked = useCallback(async () => {
    const cached = qc.getQueryData<CartRead>(cartKeys.detail(cartId));
    if (cached?.status !== 'checkout_locked') return;
    try {
      await cancelCart.mutateAsync();
    } catch (error) {
      notifyApiError(error);
    }
  }, [cancelCart, cartId, qc]);

  useEffect(() => {
    if (cartError) onCartMissing();
  }, [cartError, onCartMissing]);

  function onAddLine(productId: number, qty = 1) {
    const pid = productId;
    if (!Number.isFinite(pid)) return;
    addLineChainRef.current = addLineChainRef.current
      .then(() => addLine.mutateAsync({ product_id: pid, qty }))
      .catch((e) => {
        notify.error(getApiErrorMessage(e));
      });
  }

  if (cartLoading || !cart) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        {t('register.loading_cart')}
      </div>
    );
  }

  const editable = cart.status === 'active' && canUpdateCart;
  const isLocked = cart.status === 'checkout_locked';

  async function openCheckout() {
    const hasPayableLines = cart.lines.some((ln) => (ln.qty ?? 0) > 0);
    if (!hasPayableLines) {
      notify.info(t('register.cart_empty'));
      return;
    }
    if (cart.status === 'active' && canUpdateCart) {
      try {
        await lock.mutateAsync();
      } catch (error) {
        notifyApiError(error);
        return;
      }
    }
    setTenderOpen(true);
  }

  async function handlePark() {
    const hasPayableLines = cart.lines.some((ln) => (ln.qty ?? 0) > 0);
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

  async function handleCancelCart() {
    try {
      if (cart.status === 'checkout_locked') {
        await cancelCart.mutateAsync();
        setTenderOpen(false);
        return;
      }
      await cancelCart.mutateAsync();
      await onOpenFreshCart({ dropDetailFor: cartId });
    } catch (error) {
      notifyApiError(error);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[2fr_1fr_3fr] xl:grid-rows-1 xl:gap-4 xl:overflow-hidden">
        <RegisterCartColumn
          cart={cart}
          editable={editable}
          isLocked={isLocked}
          transactionsInShift={transactionsInShift}
          onQtyChange={(lineId, productId, qty) => {
            void updateQty
              .mutateAsync({ line_id: lineId, product_id: productId, qty })
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
          onApplyDiscount={async (code, amount) => {
            try {
              await applyDisc.mutateAsync({ code, amount });
            } catch (error) {
              notifyApiError(error);
            }
          }}
          onCheckout={() => void openCheckout()}
          onPark={() => void handlePark()}
          onNewCart={() => void handlePark()}
          onCancelCart={() => void handleCancelCart()}
          onShowParked={onShowParked}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 px-0.5 pt-2 sm:px-1">
          <div className="shrink-0">
            <CustomerPicker
              value={(cart as typeof cart & { customer_id?: number | null }).customer_id ?? null}
              disabled={!editable}
              onChange={async (customerId) => {
                await updateCustomer.mutateAsync(customerId);
              }}
            />
          </div>
          <ProductGrid
            disabled={!editable}
            onAddProduct={(productId, qty) => void onAddLine(productId, qty)}
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
        const c = await createCartMutRef.current.mutateAsync({
          terminal_id: terminalId,
          shift_id: shift.id,
          customer_id: null,
        });
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
    [qc, setActiveCartId, shift?.id, terminalId],
  );

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptModel, setReceiptModel] = useState<ThermalReceiptModel | null>(null);
  const [receiptCredit, setReceiptCredit] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [cartCreateError, setCartCreateError] = useState<string | null>(null);
  const [cartRetryNonce, setCartRetryNonce] = useState(0);

  // Parked invoices dialog — lifted so both toolbar and totals column can open it
  const [parkedOpen, setParkedOpen] = useState(false);

  // Parked carts for badge count (fetched here so both toolbar & totals column share the same data)
  const parkedCarts = useParkedCarts(terminalId ?? 0);
  const parkedCount = parkedCarts.data?.length ?? 0;

  // Active cart (cached by TanStack Query — no extra network round-trip)
  const { data: activeCart } = useCart(activeCartId);
  const activeCartHasLines = (activeCart?.lines?.length ?? 0) > 0;

  useEffect(() => {
    if (!shift?.id || !terminalId) return;
    if (activeCartId != null) return;
    if (cartCreateError || creatingCartRef.current) return;
    let cancelled = false;
    creatingCartRef.current = true;
    void (async () => {
      try {
        const c = await createCartMutRef.current.mutateAsync({
          terminal_id: terminalId,
          shift_id: shift.id,
          customer_id: null,
        });
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
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#f8f7f4] p-3">
      <RegisterToolbar
        onReturnOpen={() => setReturnOpen(true)}
        terminalId={terminalId}
        branchLabel={branchLabel}
        currency={POS_CURRENCY}
        activeCartId={activeCartId}
        activeCartHasLines={activeCartHasLines}
        onParkCurrent={parkCurrentCart}
        onResumeCart={resumeCart}
        parkedOpen={parkedOpen}
        onParkedOpenChange={setParkedOpen}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeCartId && shift ? (
          <RegisterSession
            cartId={activeCartId}
            terminalId={terminalId}
            branchLabel={branchLabel}
            transactionsInShift={shift.transactions_in_shift ?? 0}
            parkedCount={parkedCount}
            onOpenFreshCart={openFreshCartAfterSessionEnd}
            onTenderDone={onTenderDone}
            onCartMissing={resetCartAndRetry}
            onShowParked={() => setParkedOpen(true)}
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
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            {t('register.loading_cart')}
          </div>
        )}
      </div>

      <ReturnDrawer
        open={returnOpen}
        onOpenChange={setReturnOpen}
        branchLabel={branchLabel}
        currency={POS_CURRENCY}
        exchangeCartId={activeCartId}
        onCredit={(model) => {
          setReceiptModel(model);
          setReceiptCredit(true);
          setReceiptOpen(true);
        }}
      />

      {receiptModel ? (
        <ReceiptModal
          open={receiptOpen}
          onOpenChange={(o) => {
            setReceiptOpen(o);
            if (!o) setReceiptModel(null);
          }}
          model={receiptModel}
          creditMode={receiptCredit}
        />
      ) : null}
    </div>
  );
}
