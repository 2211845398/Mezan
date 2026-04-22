import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useOnline } from '@/hooks/useOnline';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import type { PosShiftOpen } from '../api';
import { CartLineRow } from '../components/CartLineRow';
import { CartTotals } from '../components/CartTotals';
import { CustomerPicker } from '../components/CustomerPicker';
import { DiscountPicker } from '../components/DiscountPicker';
import { ProductSearch } from '../components/ProductSearch';
import { ReceiptModal } from '../components/ReceiptModal';
import { ReturnDrawer } from '../components/ReturnDrawer';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { type TenderDone,TenderDrawer } from '../components/TenderDrawer';
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
};

function RegisterSession({
  cartId,
  shift,
  terminalId,
  branchLabel,
  onNewSale,
  onTenderDone,
}: RegisterSessionProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();
  const { data: cart, isLoading: cartLoading } = useCart(cartId);

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

  async function onAddLine() {
    if (!productPick) return;
    const pid = Number.parseInt(productPick, 10);
    try {
      await addLine.mutateAsync({ product_id: pid, qty: lineQty });
      setProductPick(undefined);
      setLineQty(1);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (cartLoading || !cart) {
    return <p className="text-sm text-muted-foreground">…</p>;
  }

  const editable = cart.status === 'active' && canUpdateCart;
  const isLocked = cart.status === 'checkout_locked';

  return (
    <>
      {!online ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t('shell.offline')}
        </p>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-2 lg:overflow-hidden">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <CustomerPicker />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <ProductSearch
                value={productPick}
                onChange={(id) => setProductPick(id != null ? String(id) : undefined)}
                disabled={!editable}
              />
            </div>
            <div className="w-24">
              <label className="text-[11px] text-muted-foreground">{t('register.qty')}</label>
              <Input
                type="number"
                min={1}
                value={lineQty}
                disabled={!editable}
                onChange={(e) => setLineQty(Number.parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <Button type="button" onClick={() => void onAddLine()} disabled={!editable || !productPick}>
              {t('register.add_product')}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-2">
            {!cart.lines?.length ? (
              <p className="text-sm text-muted-foreground">{t('register.cart')}</p>
            ) : (
              cart.lines.map((ln) => (
                <CartLineRow
                  key={ln.id}
                  line={ln}
                  currency={POS_CURRENCY}
                  editable={!!editable}
                  onQtyChange={(productId, qty) => {
                    void updateQty.mutateAsync({ product_id: productId, qty });
                  }}
                />
              ))
            )}
            {!editable && cart.status !== 'checkout_locked' ? (
              <p className="mt-2 text-xs text-muted-foreground">{t('register.cannot_edit')}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <CartTotals cart={cart} currency={POS_CURRENCY} />
          <div className="flex flex-wrap gap-2">
            {canDiscount ? (
              <DiscountPicker
                disabled={!editable}
                onApply={async (code, amount) => {
                  await applyDisc.mutateAsync({ code, amount });
                }}
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={!editable}
              onClick={() => void park.mutateAsync()}
            >
              {t('register.park')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={cart.status !== 'parked'}
              onClick={() => void resume.mutateAsync()}
            >
              {t('register.resume')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!editable || !canUpdateCart}
              onClick={() => void lock.mutateAsync()}
            >
              {t('register.lock_first')}
            </Button>
            <Button
              type="button"
              disabled={!isLocked || !canPay || !canInvoice || !online}
              onClick={() => setTenderOpen(true)}
            >
              {t('register.checkout')}
            </Button>
            <Button type="button" variant="ghost" onClick={onNewSale}>
              {t('register.new_cart')}
            </Button>
          </div>
          {isLocked ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {t('register.locked')}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground" dir="ltr">
            shift #{shift.id} · terminal #{terminalId} · cart #{cartId}
          </p>
        </div>
      </div>

      <TenderDrawer
        open={tenderOpen}
        onOpenChange={setTenderOpen}
        cart={cart}
        currency={POS_CURRENCY}
        branchLabel={branchLabel}
        onDone={onTenderDone}
      />

    </>
  );
}

export default function PosRegister() {
  const { t } = useTranslation('pos');
  const branchId = useAuthStore((s) => s.activeBranchId) ?? 0;
  const branchLabel = branchId ? `Branch #${branchId}` : '';

  const { activeTerminalId: terminalId } = usePosTerminalStore();
  const { data: shift } = useCurrentShift(terminalId);
  const { activeCartId, setActiveCartId } = usePosRegisterStore();

  const createCartMut = useCreateCart();

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptModel, setReceiptModel] = useState<ThermalReceiptModel | null>(null);
  const [receiptCredit, setReceiptCredit] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  useEffect(() => {
    if (!shift?.id || !terminalId) return;
    if (activeCartId != null) return;
    let cancelled = false;
    void (async () => {
      try {
        const c = await createCartMut.mutateAsync({
          terminal_id: terminalId,
          shift_id: shift.id,
          customer_id: null,
        });
        if (!cancelled) setActiveCartId(c.id);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shift?.id, terminalId, activeCartId, createCartMut, setActiveCartId]);

  if (!terminalId) {
    return <Navigate to="/pos" replace />;
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

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/pos">{t('shell.nav_gate')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/pos/invoices">{t('shell.nav_invoices')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/pos/close">{t('shell.nav_close')}</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ShortcutsHelp />
          <Button type="button" variant="secondary" size="sm" onClick={() => setReturnOpen(true)}>
            {t('return.title')}
          </Button>
        </div>
      </div>

      {activeCartId && shift ? (
        <RegisterSession
          cartId={activeCartId}
          shift={shift}
          terminalId={terminalId}
          branchLabel={branchLabel}
          onNewSale={() => setActiveCartId(null)}
          onTenderDone={onTenderDone}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('register.cart')}…</p>
      )}

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
