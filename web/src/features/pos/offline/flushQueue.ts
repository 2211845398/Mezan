import { notify } from '@/lib/toast';

import { capturePayment, finalizeSale, submitReturn } from '../api';
import { getOfflineQueue } from './index';

/**
 * Replay pending offline ops when the browser is online. Safe to call repeatedly.
 */
export async function flushPosOfflineQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const q = getOfflineQueue();
  const ops = await q.list();
  for (const op of ops) {
    if (op.status !== 'pending') continue;
    try {
      if (op.kind === 'capture_finalize') {
        const { paymentIntentId, idempotencyKey, method, reference, cardLast4, cartId } =
          op.payload;
        await capturePayment({
          payment_intent_id: paymentIntentId,
          idempotency_key: idempotencyKey,
          method,
          reference: reference ?? null,
          card_last4: cardLast4 ?? null,
        });
        const inv = await finalizeSale({
          cart_id: cartId,
          payment_intent_id: paymentIntentId,
          idempotency_key: idempotencyKey,
        });
        await q.markSynced(op.id, String(inv.id));
      } else if (op.kind === 'return_submit') {
        const res = await submitReturn({
          invoice_barcode: op.payload.invoice_barcode,
          reason: op.payload.reason ?? null,
          lines: op.payload.lines,
          exchange_cart_id: op.payload.exchange_cart_id ?? null,
        });
        await q.markSynced(op.id, String(res.sales_return_id));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await q.markFailed(op.id, msg);
      notify.error(msg);
    }
  }
}
