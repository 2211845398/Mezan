import Decimal from 'decimal.js';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { roundCashTotal } from '@/lib/cashRounding';
import { formatCurrency } from '@/lib/format';
import { notify } from '@/lib/toast';

import { addShiftCashEvent, type CartRead, type PaymentCaptureBody, type SalesInvoiceRead } from '../api';
import { validateCashTender } from '../lib/cashTenderValidation';
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
  | { kind: 'queued'; clientUuid: string; model: ThermalReceiptModel }
  | { kind: 'exchange_refund'; refundAmount: string; model: ThermalReceiptModel };

export type TenderDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartRead;
  currency: string;
  /** POS tender currency cash rounding increment (e.g. 0.05); null disables rounding. */
  cashRoundingIncrement?: string | null;
  branchLabel: string;
  customerId?: number | null;
  /** Credit from a return leg already posted; offsets exchange cart total. */
  exchangeCredit?: Decimal | null;
  /** Open shift for cash_out refund logging. */
  shiftId?: number | null;
  /** When the drawer closes without a completed sale, unlock a checkout-locked cart. */
  onAbortCheckout?: () => void | Promise<void>;
  /** Called after payment capture succeeds and before invoice finalize (e.g. register return). */
  onAfterCapture?: (paymentIntentId: number) => Promise<void>;
  onDone: (result: TenderDone) => void;
};

export function TenderDrawer({
  open,
  onOpenChange,
  cart,
  currency,
  cashRoundingIncrement = null,
  branchLabel,
  customerId = null,
  exchangeCredit = null,
  shiftId = null,
  onAbortCheckout,
  onAfterCapture,
  onDone,
}: TenderDrawerProps) {
  const { t, i18n } = useTranslation('pos');
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

  const exchangeItemsDec = new Decimal(cart.total);
  const creditDec = exchangeCredit ?? new Decimal(0);
  const hasExchangeOffset = exchangeCredit != null && exchangeCredit.greaterThan(0);
  const netDec = exchangeItemsDec.minus(creditDec);
  const isRefundDue = hasExchangeOffset && netDec.lessThanOrEqualTo(0);
  const exactDueDec = isRefundDue ? new Decimal(0) : hasExchangeOffset ? netDec : exchangeItemsDec;

  const tenderedDec = tendered ? new Decimal(tendered) : null;

  const cashRoundingPreview = useMemo(() => {
    if (!cashRoundingIncrement) {
      return { rounded: exactDueDec, roundingDifference: new Decimal(0) };
    }
    return roundCashTotal(exactDueDec, cashRoundingIncrement);
  }, [cashRoundingIncrement, exactDueDec]);

  const isPartialCash =
    method === 'cash' &&
    tenderedDec != null &&
    tenderedDec.greaterThan(0) &&
    customerId != null &&
    customerId > 0 &&
    cashRoundingIncrement != null &&
    cashRoundingPreview.rounded.greaterThan(tenderedDec);

  const amountDueDec = useMemo(() => {
    if (method !== 'cash' || !cashRoundingIncrement || isPartialCash) {
      return exactDueDec;
    }
    return cashRoundingPreview.rounded;
  }, [method, cashRoundingIncrement, isPartialCash, exactDueDec, cashRoundingPreview.rounded]);

  const shortfall =
    method === 'cash' && tenderedDec != null && tenderedDec.lessThan(amountDueDec)
      ? amountDueDec.minus(tenderedDec)
      : null;
  const changeDue =
    method === 'cash' && tenderedDec != null && tenderedDec.greaterThan(amountDueDec)
      ? tenderedDec.minus(amountDueDec)
      : null;

  const refundAmountDec = isRefundDue ? netDec.abs() : new Decimal(0);

  const hasCustomer = customerId != null && customerId > 0;
  const cashTenderValidation =
    method === 'cash'
      ? validateCashTender({ tendered, amountDue: amountDueDec, hasCustomer })
      : { valid: true as const };

  const canPay =
    !isRefundDue &&
    amountDueDec.greaterThan(0) &&
    !busy &&
    (method === 'transfer' ||
      (method === 'card' && /^\d{4}$/.test(cardLast4.trim())) ||
      (method === 'cash' && cashTenderValidation.valid));

  const canCompleteRefund =
    isRefundDue && !busy && shiftId != null && refundAmountDec.greaterThan(0);

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
        payment_method: captureMethodFromUi(method),
        ...(method === 'cash' && tendered ? { cash_tendered: tendered } : {}),
        ...(hasExchangeOffset && creditDec.greaterThan(0)
          ? { exchange_credit_amount: creditDec.toFixed(2) }
          : {}),
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
      const check = validateCashTender({ tendered, amountDue: amountDueDec, hasCustomer });
      if (!check.valid) {
        setBusy(false);
        notify.error(t(check.errorKey ?? 'tender.cash_invalid'));
        return;
      }
      const td = new Decimal(tendered);
      if (td.lessThanOrEqualTo(amountDueDec)) {
        captureBody.cash_tendered = td.toFixed(2);
      }
    }

    try {
      await capture.mutateAsync(captureBody);
      if (onAfterCapture) {
        await onAfterCapture(intentId);
      }
      const inv = await finalize.mutateAsync({
        cart_id: cart.id,
        payment_intent_id: intentId,
        idempotency_key: idem,
      });

      let changeStr: string | null = null;
      let tenderedStr: string | null = null;
      let remainingStr: string | null = null;
      if (method === 'cash' && tendered) {
        tenderedStr = tendered;
        if (changeDue != null && changeDue.greaterThan(0)) {
          changeStr = changeDue.toFixed(2);
        }
        if (shortfall != null && shortfall.greaterThan(0)) {
          remainingStr = shortfall.toFixed(2);
        }
      }

      const model = thermalModelFromCart(cart, {
        branchLabel,
        currency,
        invoiceNumber: inv.invoice_number,
        paymentMethod: method,
        tendered: tenderedStr,
        changeDue: changeStr,
        remaining: remainingStr,
        amountPaid: inv.amount_paid,
        roundingDifference: inv.rounding_difference ?? '0',
      });
      skipAbortOnCloseRef.current = true;
      onDone({ kind: 'invoice', invoice: inv, model });
      handleOpenChange(false);
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
        handleOpenChange(false);
      } else {
        mapPosErrorToToast(err, (k) => t(k));
      }
    } finally {
      setBusy(false);
    }
  }

  async function completeExchangeRefund() {
    if (!shiftId || !canCompleteRefund) return;
    setBusy(true);
    try {
      const amt = refundAmountDec.toFixed(2);
      await addShiftCashEvent(shiftId, {
        event_type: 'refund',
        amount: amt,
        note: t('tender.refund_due'),
      });
      const model = thermalModelFromCart(cart, {
        branchLabel,
        currency,
        invoiceNumber: null,
        paymentMethod: 'cash',
        tendered: amt,
        changeDue: '0',
      });
      skipAbortOnCloseRef.current = true;
      onDone({ kind: 'exchange_refund', refundAmount: amt, model });
      handleOpenChange(false);
    } catch (err) {
      mapPosErrorToToast(err, (k) => t(k));
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && !skipAbortOnCloseRef.current) {
      void onAbortCheckout?.();
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" dir={i18n.dir()}>
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{t('tender.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[calc(100dvh-14rem)] gap-4 overflow-y-auto px-6 py-4">
          {hasExchangeOffset ? (
            <div className="space-y-2 rounded-lg border border-primary/20 bg-muted/30 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t('tender.exchange_new_items')}</span>
                <span className="font-medium tabular-nums" dir="ltr">
                  {formatCurrency(exchangeItemsDec.toNumber(), currency)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t('tender.exchange_credit')}</span>
                <span className="font-medium tabular-nums text-amber-800 dark:text-amber-200" dir="ltr">
                  −{formatCurrency(creditDec.toNumber(), currency)}
                </span>
              </div>
              <div className="flex justify-between gap-2 border-t border-border/60 pt-2 font-semibold">
                <span>{t('tender.net_exchange')}</span>
                <span className="tabular-nums" dir="ltr">
                  {formatCurrency(netDec.toNumber(), currency)}
                </span>
              </div>
            </div>
          ) : null}
          {isRefundDue ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {t('tender.refund_due')}:{' '}
                <span dir="ltr">{formatCurrency(refundAmountDec.toNumber(), currency)}</span>
              </p>
            </div>
          ) : null}
          {!isRefundDue ? (
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
          ) : null}
          {!isRefundDue && method === 'cash' ? (
            <div className="space-y-1">
              <Label>{t('tender.tendered')}</Label>
              <MoneyInput value={tendered} onChange={setTendered} />
              {tenderedDec != null && tenderedDec.greaterThanOrEqualTo(0) ? (
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
          {!isRefundDue && method === 'card' ? (
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
          {!isRefundDue && method === 'transfer' ? (
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
              onClick={() => handleOpenChange(false)}
            >
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            {isRefundDue ? (
              <Button
                type="button"
                className="min-h-12 min-w-[8rem] font-semibold"
                onClick={() => void completeExchangeRefund()}
                disabled={!canCompleteRefund}
              >
                {t('tender.complete_refund')}
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-12 min-w-[8rem] font-semibold"
                onClick={() => void pay()}
                disabled={!canPay}
              >
                {t('tender.pay')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
