import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { useAuthStore } from '@/features/auth/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import type { PosShiftOpen } from '../api';
import { ReceiptModal } from '../components/ReceiptModal';
import { RegisterCartColumn } from '../components/RegisterCartColumn';
import { RegisterTotalsColumn } from '../components/RegisterTotalsColumn';
import { RegisterToolbar } from '../components/RegisterToolbar';
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
};

function RegisterSession({
  cartId,
  shift,
  terminalId,
  branchLabel,
  onNewSale,
  onTenderDone,
}: RegisterSessionProps) {
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:grid-rows-1 lg:gap-6 lg:overflow-hidden">
        <RegisterCartColumn
          cart={cart}
          editable={editable}
          isLocked={isLocked}
          productPick={productPick}
          onProductPickChange={setProductPick}
          lineQty={lineQty}
          onLineQtyChange={setLineQty}
          onAddLine={() => void onAddLine()}
          addLineDisabled={!editable || !productPick}
          onQtyChange={(productId, qty) => {
            void updateQty.mutateAsync({ product_id: productId, qty });
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
            await applyDisc.mutateAsync({ code, amount });
          }}
          onPark={() => park.mutateAsync()}
          onResume={() => resume.mutateAsync()}
          onLock={() => lock.mutateAsync()}
          onCheckout={() => setTenderOpen(true)}
          onNewSale={onNewSale}
        />
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
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <RegisterToolbar onReturnOpen={() => setReturnOpen(true)} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
