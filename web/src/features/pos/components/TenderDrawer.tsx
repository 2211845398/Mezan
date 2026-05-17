import Decimal from 'decimal.js';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useOnline } from '@/hooks/useOnline';
import { newIdempotencyKey } from '@/lib/idempotency';
import { notify } from '@/lib/toast';

import type { CartRead, PaymentCaptureBody, SalesInvoiceRead } from '../api';
import { getOfflineQueue } from '../offline';
import type { CaptureFinalizePayload } from '../offline/queue';
import { thermalModelFromCart, tmpWatermarkFromClientUuid } from '../print/mapModel';
import type { ThermalReceiptModel } from '../print/types';
import {
  mapPosErrorToToast,
  useCapturePaymentMutation,
  useCreatePaymentIntent,
  useFinalizeSaleMutation,
} from '../queries';

type TenderUiMethod = 'cash' | 'card' | 'transfer';

function captureMethodFromUi(m: TenderUiMethod): PaymentCaptureBody['method'] {
  return m;
}

function offlineCaptureMethodFromUi(m: TenderUiMethod): CaptureFinalizePayload['method'] {
  return m;
}

export type TenderDone =
  | { kind: 'invoice'; invoice: SalesInvoiceRead; model: ThermalReceiptModel }
  | { kind: 'queued'; clientUuid: string; model: ThermalReceiptModel };

export type TenderDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartRead;
  currency: string;
  branchLabel: string;
  customerId?: number | null;
  /** When the drawer closes without a completed sale, unlock a checkout-locked cart. */
  onAbortCheckout?: () => void | Promise<void>;
  onDone: (result: TenderDone) => void;
};

export function TenderDrawer({
  open,
  onOpenChange,
  cart,
  currency,
  branchLabel,
  customerId = null,
  onAbortCheckout,
  onDone,
}: TenderDrawerProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();
  const skipAbortOnCloseRef = useRef(false);
  const idemRef = useRef<string | null>(null);
  const [method, setMethod] = useState<TenderUiMethod>('cash');
  const [reference, setReference] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);

  const createIntent = useCreatePaymentIntent();
  const capture = useCapturePaymentMutation();
  const finalize = useFinalizeSaleMutation();

  useEffect(() => {
    if (!open) {
      idemRef.current = null;
      setBusy(false);
      setReference('');
      setCardLast4('');
      setTendered('');
      setMethod('cash');
    } else {
      skipAbortOnCloseRef.current = false;
    }
  }, [open]);

  const total = Number.parseFloat(cart.total);
  const totalDec = new Decimal(cart.total);
  const tenderedDec = tendered ? new Decimal(tendered) : null;
  const shortfall =
    method === 'cash' && tenderedDec != null && tenderedDec.lessThan(totalDec)
      ? totalDec.minus(tenderedDec)
      : null;
  const changeDue =
    method === 'cash' && tenderedDec != null && tenderedDec.greaterThan(totalDec)
      ? tenderedDec.minus(totalDec)
      : null;

  const canPay =
    totalDec.greaterThan(0) &&
    !busy &&
    (method === 'transfer' ||
      (method === 'card' && /^\d{4}$/.test(cardLast4.trim())) ||
      (method === 'cash' &&
        !!tendered &&
        tenderedDec != null &&
        tenderedDec.greaterThan(0) &&
        (tenderedDec.greaterThanOrEqualTo(totalDec) || (customerId != null && customerId > 0))));

  async function pay() {
    if (!idemRef.current) idemRef.current = newIdempotencyKey();
    const idem = idemRef.current;

    setBusy(true);
    let intentId = 0;
    try {
      const intent = await createIntent.mutateAsync({
        cart_id: cart.id,
        provider: 'in_store',
        currency,
      });
      intentId = intent.id;
    } catch (err) {
      setBusy(false);
      if (!online) {
        notify.error(t('tender.need_online_intent'));
        return;
      }
      mapPosErrorToToast(err, (k) => t(k));
      return;
    }

    const captureBody: PaymentCaptureBody = {
      payment_intent_id: intentId,
      idempotency_key: idem,
      method: captureMethodFromUi(method),
      reference: method === 'transfer' ? (reference.trim() || null) : null,
      card_last4: method === 'card' ? cardLast4.trim() : null,
    };
    if (method === 'cash' && tendered) {
      const td = new Decimal(tendered);
      if (td.lessThan(totalDec) && (!customerId || customerId <= 0)) {
        setBusy(false);
        notify.error(t('tender.partial_cash_needs_customer'));
        return;
      }
      if (td.lessThanOrEqualTo(totalDec)) {
        captureBody.cash_tendered = td.toFixed(2);
      }
    }

    try {
      await capture.mutateAsync(captureBody);
      const inv = await finalize.mutateAsync({
        cart_id: cart.id,
        payment_intent_id: intentId,
        idempotency_key: idem,
      });

      let changeStr: string | null = null;
      let tenderedStr: string | null = null;
      if (method === 'cash' && tendered) {
        tenderedStr = tendered;
        changeStr = changeDue != null && changeDue.greaterThan(0) ? changeDue.toFixed(2) : '0';
      }

      const model = thermalModelFromCart(cart, {
        branchLabel,
        currency,
        invoiceNumber: inv.invoice_number,
        paymentMethod: method,
        tendered: tenderedStr,
        changeDue: changeStr,
      });
      skipAbortOnCloseRef.current = true;
      onDone({ kind: 'invoice', invoice: inv, model });
      onOpenChange(false);
    } catch (err) {
      if (!navigator.onLine && intentId > 0) {
        const clientUuid = crypto.randomUUID();
        await getOfflineQueue().enqueue({
          clientUuid,
          kind: 'capture_finalize',
          payload: {
            cartId: cart.id,
            paymentIntentId: intentId,
            idempotencyKey: idem,
            method: offlineCaptureMethodFromUi(method),
            reference: method === 'transfer' ? (reference.trim() || null) : null,
            cardLast4: method === 'card' ? cardLast4.trim() : null,
          },
        });

        let changeStr: string | null = null;
        let tenderedStr: string | null = null;
        if (method === 'cash' && tendered) {
          tenderedStr = tendered;
          changeStr = changeDue != null && changeDue.greaterThan(0) ? changeDue.toFixed(2) : '0';
        }

        const model = thermalModelFromCart(cart, {
          branchLabel,
          currency,
          invoiceNumber: null,
          provisionalWatermark: tmpWatermarkFromClientUuid(clientUuid),
          paymentMethod: method,
          tendered: tenderedStr,
          changeDue: changeStr,
        });
        notify.info(t('tender.offline_queued'));
        skipAbortOnCloseRef.current = true;
        onDone({ kind: 'queued', clientUuid, model });
        onOpenChange(false);
      } else {
        mapPosErrorToToast(err, (k) => t(k));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !skipAbortOnCloseRef.current) {
          void onAbortCheckout?.();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{t('tender.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[calc(100dvh-14rem)] gap-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {(['cash', 'card', 'transfer'] as const).map((m) => (
              <Button
                key={m}
                type="button"
                className="min-h-11 min-w-[5rem]"
                variant={method === m ? 'default' : 'outline'}
                onClick={() => setMethod(m)}
              >
                {t(`tender.${m}`)}
              </Button>
            ))}
          </div>
          {method === 'cash' ? (
            <div className="space-y-1">
              <Label>{t('tender.tendered')}</Label>
              <MoneyInput value={tendered} onChange={setTendered} />
              {tenderedDec != null && tenderedDec.greaterThan(0) ? (
                <div className="space-y-1 text-xs text-muted-foreground" dir="ltr">
                  {changeDue != null && changeDue.greaterThan(0) ? (
                    <p>
                      {t('tender.change')}: {changeDue.toFixed(2)}
                    </p>
                  ) : null}
                  {shortfall != null && shortfall.greaterThan(0) ? (
                    <p className="text-amber-800 dark:text-amber-200">
                      {t('tender.shortfall_ar', { amount: shortfall.toFixed(2) })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {method === 'card' ? (
            <div className="space-y-1">
              <Label>{t('tender.card_last4')}</Label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm tracking-widest"
                value={cardLast4}
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0000"
                onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>
          ) : null}
          {method === 'transfer' ? (
            <div className="space-y-1">
              <Label>{t('tender.reference')}</Label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t('tender.transfer_ref_placeholder')}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter className="flex flex-col gap-[5px] border-t px-6 py-4">
          <div className="flex w-full flex-wrap gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => onOpenChange(false)}
            >
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <Button
              type="button"
              className="min-h-12 min-w-[8rem] font-semibold"
              onClick={() => void pay()}
              disabled={!canPay}
            >
              {t('tender.pay')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
