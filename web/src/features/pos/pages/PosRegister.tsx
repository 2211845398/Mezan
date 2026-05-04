import { Package } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { getApiErrorMessage, notifyApiError } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import type { PosShiftOpen } from '../api';
import { CustomerPicker } from '../components/CustomerPicker';
import { ProductSearch } from '../components/ProductSearch';
import { ReceiptModal } from '../components/ReceiptModal';
import { RegisterCartColumn } from '../components/RegisterCartColumn';
import { RegisterToolbar } from '../components/RegisterToolbar';
import { RegisterTotalsColumn } from '../components/RegisterTotalsColumn';
import { ReturnDrawer } from '../components/ReturnDrawer';
import { type TenderDone, TenderDrawer } from '../components/TenderDrawer';
import type { ThermalReceiptModel } from '../print/types';
import {
  useAddLine,
  useApplyDiscount,
  useCart,
  useCreateCart,
  useCurrentShift,
  useLockCart,
  useParkCart,
  useResumeCart,
  useUpdateLineQty,
} from '../queries';
import { usePosRegisterStore } from '../stores/posRegisterStore';
import { usePosTerminalStore } from '../stores/posTerminalStore';

const POS_CURRENCY = 'USD';

type RegisterSessionProps = {
  cartId: number;
  shift: PosShiftOpen;
  terminalId: number;
  branchLabel: string;
  onNewSale: () => void;
  onTenderDone: (result: TenderDone) => void;
  onCartMissing: () => void;
};

function RegisterSession({
  cartId,
  shift,
  terminalId,
  branchLabel,
  onNewSale,
  onTenderDone,
  onCartMissing,
}: RegisterSessionProps) {
  const { t } = useTranslation('pos');
  const { data: cart, isError: cartError, isLoading: cartLoading } = useCart(cartId);

  const canUpdateCart = usePermission('pos_carts', 'update');
  const canDiscount = usePermission('pos_carts', 'discount');
  const canPayCreate = usePermission('pos_payments', 'create');
  const canPayCapture = usePermission('pos_payments', 'capture');
  const canPay = canPayCreate && canPayCapture;
  const canInvoice = usePermission('sales_invoices', 'create');

  const [productPick, setProductPick] = useState<string | undefined>();
  const [lineQty, setLineQty] = useState(1);
  const [tenderOpen, setTenderOpen] = useState(false);

  const addLine = useAddLine(cartId);
  const updateQty = useUpdateLineQty(cartId);
  const applyDisc = useApplyDiscount(cartId);
  const park = useParkCart(cartId);
  const resume = useResumeCart(cartId);
  const lock = useLockCart(cartId);

  useEffect(() => {
    if (cartError) onCartMissing();
  }, [cartError, onCartMissing]);

  async function onAddLine() {
    if (!productPick) return;
    const pid = Number.parseInt(productPick, 10);
    try {
      await addLine.mutateAsync({ product_id: pid, qty: lineQty });
      setProductPick(undefined);
      setLineQty(1);
    } catch (e) {
      notify.error(getApiErrorMessage(e));
    }
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(18rem,0.92fr)_15rem_minmax(28rem,1.65fr)] xl:grid-rows-1 xl:gap-4 xl:overflow-hidden">
        <RegisterCartColumn
          cart={cart}
          editable={editable}
          isLocked={isLocked}
          onQtyChange={(productId, qty) => {
            void updateQty
              .mutateAsync({ product_id: productId, qty })
              .catch((error) => notifyApiError(error));
          }}
          currency={POS_CURRENCY}
        />
        <RegisterTotalsColumn
          cart={cart}
          currency={POS_CURRENCY}
          shift={shift}
          terminalId={terminalId}
          cartId={cartId}
          canDiscount={canDiscount}
          canUpdateCart={canUpdateCart}
          canPay={canPay}
          canInvoice={canInvoice}
          editable={editable}
          isLocked={isLocked}
          onApplyDiscount={async (code, amount) => {
            try {
              await applyDisc.mutateAsync({ code, amount });
            } catch (error) {
              notifyApiError(error);
            }
          }}
          onPark={() => park.mutateAsync().catch((error) => notifyApiError(error))}
          onResume={() => resume.mutateAsync().catch((error) => notifyApiError(error))}
          onLock={() => lock.mutateAsync().catch((error) => notifyApiError(error))}
          onCheckout={() => setTenderOpen(true)}
          onNewSale={onNewSale}
        />
        <section className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-3 shadow-sm">
          <div className="grid gap-2">
            <ProductSearch
              value={productPick}
              onChange={(id) => setProductPick(id != null ? String(id) : undefined)}
              disabled={!editable}
            />
            <CustomerPicker />
            <div className="grid gap-2 sm:grid-cols-[6rem_1fr]">
              <div>
                <label className="text-xs text-muted-foreground">{t('register.qty')}</label>
                <Input
                  type="number"
                  min={1}
                  className="min-h-11"
                  value={lineQty}
                  disabled={!editable}
                  onChange={(e) => setLineQty(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <Button
                type="button"
                className="min-h-11 self-end"
                onClick={() => void onAddLine()}
                disabled={!editable || !productPick}
              >
                {t('register.add_product')}
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-muted/10 p-6 text-center text-sm text-muted-foreground">
            <div className="grid justify-items-center gap-2">
              <span className="rounded-full bg-muted/40 p-3">
                <Package className="size-8 opacity-45" />
              </span>
              <p className="font-medium">{t('register.products_empty')}</p>
              <p className="text-xs">{t('register.products_empty_hint')}</p>
            </div>
          </div>
        </section>
      </div>

      <TenderDrawer
        open={tenderOpen}
        onOpenChange={setTenderOpen}
        cart={cart}
        currency={POS_CURRENCY}
        branchLabel={branchLabel}
        onDone={onTenderDone}
      />
    </div>
  );
}

export default function PosRegister() {
  const { t } = useTranslation('pos');
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 0;
  const branchLabel = branchId ? `Branch #${branchId}` : '';

  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const { data: shift, isError: shiftError, isLoading: shiftLoading } = useCurrentShift(terminalId);
  const { activeCartId, setActiveCartId } = usePosRegisterStore();

  const createCartMut = useCreateCart();
  const creatingCartRef = useRef(false);

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptModel, setReceiptModel] = useState<ThermalReceiptModel | null>(null);
  const [receiptCredit, setReceiptCredit] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [cartCreateError, setCartCreateError] = useState<string | null>(null);
  const [cartRetryNonce, setCartRetryNonce] = useState(0);

  useEffect(() => {
    if (!shift?.id || !terminalId) return;
    if (activeCartId != null) return;
    if (cartCreateError || creatingCartRef.current) return;
    let cancelled = false;
    creatingCartRef.current = true;
    void (async () => {
      try {
        const c = await createCartMut.mutateAsync({
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
    createCartMut,
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
      setActiveCartId(null);
    }
  }

  function resetCartAndRetry() {
    setCartCreateError(null);
    setActiveCartId(null);
    setCartRetryNonce((n) => n + 1);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#f8f7f4] p-3">
      <RegisterToolbar onReturnOpen={() => setReturnOpen(true)} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeCartId && shift ? (
          <RegisterSession
            cartId={activeCartId}
            shift={shift}
            terminalId={terminalId}
            branchLabel={branchLabel}
            onNewSale={resetCartAndRetry}
            onTenderDone={onTenderDone}
            onCartMissing={resetCartAndRetry}
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
