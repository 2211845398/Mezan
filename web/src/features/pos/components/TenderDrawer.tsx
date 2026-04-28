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

import type { CartRead, SalesInvoiceRead } from '../api';
import { getOfflineQueue } from '../offline';
import { thermalModelFromCart, tmpWatermarkFromClientUuid } from '../print/mapModel';
import type { ThermalReceiptModel } from '../print/types';
import {
  mapPosErrorToToast,
  useCapturePaymentMutation,
  useCreatePaymentIntent,
  useFinalizeSaleMutation,
} from '../queries';

export type TenderDone =
  | { kind: 'invoice'; invoice: SalesInvoiceRead; model: ThermalReceiptModel }
  | { kind: 'queued'; clientUuid: string; model: ThermalReceiptModel };

export type TenderDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartRead;
  currency: string;
  branchLabel: string;
  onDone: (result: TenderDone) => void;
};

export function TenderDrawer({
  open,
  onOpenChange,
  cart,
  currency,
  branchLabel,
  onDone,
}: TenderDrawerProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();
  const idemRef = useRef<string | null>(null);
  const [method, setMethod] = useState<'cash' | 'card' | 'other'>('cash');
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
    }
  }, [open]);

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

    try {
      await capture.mutateAsync({
        payment_intent_id: intentId,
        idempotency_key: idem,
        method,
        reference: reference.trim() || null,
        card_last4: cardLast4.trim() || null,
      });
      const inv = await finalize.mutateAsync({
        cart_id: cart.id,
        payment_intent_id: intentId,
        idempotency_key: idem,
      });

      let changeDue: string | null = null;
      let tenderedStr: string | null = null;
      if (method === 'cash' && tendered) {
        tenderedStr = tendered;
        const ch = new Decimal(tendered).minus(new Decimal(cart.total));
        changeDue = ch.greaterThan(0) ? ch.toFixed(2) : '0';
      }

      const model = thermalModelFromCart(cart, {
        branchLabel,
        currency,
        invoiceNumber: inv.invoice_number,
        paymentMethod: method,
        tendered: tenderedStr,
        changeDue,
      });
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
            method,
            reference: reference.trim() || null,
            cardLast4: cardLast4.trim() || null,
          },
        });

        let changeDue: string | null = null;
        let tenderedStr: string | null = null;
        if (method === 'cash' && tendered) {
          tenderedStr = tendered;
          const ch = new Decimal(tendered).minus(new Decimal(cart.total));
          changeDue = ch.greaterThan(0) ? ch.toFixed(2) : '0';
        }

        const model = thermalModelFromCart(cart, {
          branchLabel,
          currency,
          invoiceNumber: null,
          provisionalWatermark: tmpWatermarkFromClientUuid(clientUuid),
          paymentMethod: method,
          tendered: tenderedStr,
          changeDue,
        });
        notify.info(t('tender.offline_queued'));
        onDone({ kind: 'queued', clientUuid, model });
        onOpenChange(false);
      } else {
        mapPosErrorToToast(err, (k) => t(k));
      }
    } finally {
      setBusy(false);
    }
  }

  const total = Number.parseFloat(cart.total);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{t('tender.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[calc(100dvh-14rem)] gap-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {(['cash', 'card', 'other'] as const).map((m) => (
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
              {tendered ? (
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {t('tender.change')}:{' '}
                  {new Decimal(tendered).minus(new Decimal(total)).greaterThan(0)
                    ? new Decimal(tendered).minus(new Decimal(total)).toFixed(2)
                    : '0'}
                </p>
              ) : null}
            </div>
          ) : null}
          {method === 'card' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('tender.reference')}</Label>
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('tender.card_last4')}</Label>
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={cardLast4}
                  maxLength={4}
                  onChange={(e) => setCardLast4(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 border-t px-6 py-4 sm:justify-between">
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
            disabled={
              busy ||
              (method === 'cash' &&
                (!tendered || new Decimal(tendered).lessThan(new Decimal(total))))
            }
          >
            {t('tender.pay')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
