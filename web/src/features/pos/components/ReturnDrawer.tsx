import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import type { CartRead, ReturnLookupRead } from '../api';
import { addCartLine, getCart } from '../api';
import { thermalModelFromCreditNote } from '../print/mapModel';
import type { ThermalReceiptModel } from '../print/types';
import { cartKeys, useReturnLookup, useSubmitReturnMutation } from '../queries';

export type ReturnExchangeSession = {
  invoiceBarcode: string;
  invoiceNumber: string;
  loads: Record<number, { productId: number; variantId: number; qtyLoaded: number }>;
};

export type ReturnDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchLabel: string;
  currency: string;
  exchangeCartId?: number | null;
  exchangeSession: ReturnExchangeSession | null;
  onExchangeSessionChange: (session: ReturnExchangeSession | null) => void;
  onCredit: (model: ThermalReceiptModel) => void;
};

export function ReturnDrawer({
  open,
  onOpenChange,
  branchLabel,
  currency,
  exchangeCartId,
  exchangeSession,
  onExchangeSessionChange,
  onCredit,
}: ReturnDrawerProps) {
  const { t } = useTranslation('pos');
  const qc = useQueryClient();
  const canReturn = usePermission('returns', 'create');
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [reason, setReason] = useState('');
  const [lookupOn, setLookupOn] = useState(false);
  const { data: lookup, isFetching } = useReturnLookup(invoiceQuery.trim() || null, lookupOn);
  const submit = useSubmitReturnMutation();

  const [loadingCart, setLoadingCart] = useState(false);
  const openedRef = useRef(false);
  const autoTriedBarcodeRef = useRef<string | null>(null);

  const lines = lookup?.lines ?? [];

  const loadCartFromLookup = useCallback(
    async (snap: ReturnLookupRead, opts?: { force?: boolean }) => {
      if (!exchangeCartId) {
        notify.error(t('return.need_cart'));
        return;
      }
      const cart = qc.getQueryData<CartRead>(cartKeys.detail(exchangeCartId));
      const hasLines = cart?.lines?.some((l) => Number(l.qty) > 0);
      if (hasLines) {
        if (!opts?.force) {
          return;
        }
        const ok = window.confirm(t('return.replace_cart_confirm'));
        if (!ok) return;
      }
      setLoadingCart(true);
      try {
        if (hasLines && cart?.lines?.length) {
          for (const ln of cart.lines) {
            if (Number(ln.qty) > 0) {
              await addCartLine(exchangeCartId, {
                product_id: ln.product_id,
                qty: 0,
                variant_id: ln.variant_id,
              });
            }
          }
        }
        const loads: ReturnExchangeSession['loads'] = {};
        let lastCart: CartRead | undefined;
        for (const el of snap.lines) {
          if (el.qty_remaining <= 0) continue;
          lastCart = await addCartLine(exchangeCartId, {
            product_id: el.product_id,
            qty: el.qty_remaining,
            variant_id: el.variant_id,
          });
          loads[el.sales_invoice_line_id] = {
            productId: el.product_id,
            variantId: el.variant_id,
            qtyLoaded: el.qty_remaining,
          };
        }
        onExchangeSessionChange({
          invoiceBarcode: snap.invoice_barcode,
          invoiceNumber: snap.invoice_number,
          loads,
        });
        if (lastCart) {
          qc.setQueryData(cartKeys.detail(exchangeCartId), lastCart);
        }
        await qc.invalidateQueries({ queryKey: cartKeys.detail(exchangeCartId) });
        notify.success(t('return.loaded_cart'));
        onOpenChange(false);
        autoTriedBarcodeRef.current = snap.invoice_barcode;
      } catch (e) {
        notify.error(e instanceof Error ? e.message : String(e));
        autoTriedBarcodeRef.current = null;
      } finally {
        setLoadingCart(false);
      }
    },
    [exchangeCartId, onExchangeSessionChange, onOpenChange, qc, t],
  );

  useEffect(() => {
    if (open && !openedRef.current && exchangeSession?.invoiceNumber) {
      setInvoiceQuery((cur) => (cur.trim() === '' ? exchangeSession.invoiceNumber : cur));
      setLookupOn(true);
    }
    openedRef.current = open;
  }, [open, exchangeSession]);

  useEffect(() => {
    if (!open) {
      setInvoiceQuery('');
      setReason('');
      setLookupOn(false);
      setLoadingCart(false);
      autoTriedBarcodeRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!lookup) return;
    if (exchangeSession && exchangeSession.invoiceBarcode !== lookup.invoice_barcode) {
      onExchangeSessionChange(null);
    }
  }, [lookup, exchangeSession, onExchangeSessionChange]);

  useEffect(() => {
    if (!invoiceQuery.trim()) {
      autoTriedBarcodeRef.current = null;
    }
  }, [invoiceQuery]);

  useEffect(() => {
    if (!open || !lookup || isFetching || loadingCart || !exchangeCartId) return;
    if (exchangeSession?.invoiceBarcode === lookup.invoice_barcode) {
      autoTriedBarcodeRef.current = lookup.invoice_barcode;
      return;
    }
    if (autoTriedBarcodeRef.current === lookup.invoice_barcode) {
      return;
    }

    const cart = qc.getQueryData<CartRead>(cartKeys.detail(exchangeCartId));
    const hasLines = cart?.lines?.some((l) => Number(l.qty) > 0);
    if (hasLines) {
      notify.warning(t('return.auto_load_need_empty_cart'));
      autoTriedBarcodeRef.current = lookup.invoice_barcode;
      return;
    }

    void loadCartFromLookup(lookup);
  }, [
    open,
    lookup,
    isFetching,
    loadingCart,
    exchangeCartId,
    exchangeSession,
    loadCartFromLookup,
    qc,
    t,
  ]);

  function runLookup() {
    if (!invoiceQuery.trim()) return;
    setLookupOn(true);
  }

  async function doSubmit() {
    if (!lookup || !exchangeCartId || !exchangeSession) return;
    if (exchangeSession.invoiceBarcode !== lookup.invoice_barcode) {
      notify.error(t('return.reload_invoice'));
      return;
    }
    const cart = await qc.fetchQuery({
      queryKey: cartKeys.detail(exchangeCartId),
      queryFn: () => getCart(exchangeCartId),
    });
    const linesPayload: { sales_invoice_line_id: number; qty: number }[] = [];
    for (const [idStr, meta] of Object.entries(exchangeSession.loads)) {
      const salesInvoiceLineId = Number.parseInt(idStr, 10);
      const cartLn = cart.lines?.find(
        (l) => l.product_id === meta.productId && l.variant_id === meta.variantId,
      );
      const current = cartLn ? Number(cartLn.qty) : 0;
      const retQty = Math.max(0, meta.qtyLoaded - current);
      if (retQty <= 0) continue;
      if (!cartLn) {
        notify.error(t('return.exchange_line_missing'));
        return;
      }
      linesPayload.push({ sales_invoice_line_id: salesInvoiceLineId, qty: retQty });
    }
    if (!linesPayload.length) {
      notify.error(t('return.none_return_qty'));
      return;
    }
    try {
      const res = await submit.mutateAsync({
        invoice_barcode: lookup.invoice_barcode,
        reason: reason.trim() || null,
        lines: linesPayload,
        exchange_cart_id: exchangeCartId ?? null,
      });
      const model = thermalModelFromCreditNote({
        branchLabel,
        currency,
        creditNumber: res.credit_number,
        total: res.total_amount,
        lines: linesPayload.map((p) => {
          const src = lines.find((l) => l.sales_invoice_line_id === p.sales_invoice_line_id);
          return {
            name: src?.product_name ?? '',
            qty: p.qty,
            unitPrice: '0',
            lineTotal: '0',
            taxAmount: '0',
          };
        }),
      });
      notify.success(t('return.credit_note', { id: res.credit_note_id }));
      onExchangeSessionChange(null);
      void qc.invalidateQueries({ queryKey: cartKeys.detail(exchangeCartId) });
      onCredit(model);
      onOpenChange(false);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (!canReturn) {
    return null;
  }

  const sessionReady =
    exchangeSession != null &&
    lookup != null &&
    exchangeSession.invoiceBarcode === lookup.invoice_barcode;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-hidden border-border bg-card p-0 sm:max-w-lg"
        dir="auto"
      >
        <DialogHeader className="border-b border-border/80 px-6 pt-6 pb-4">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>{t('return.title')}</span>
            {lookup ? (
              <span
                className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
                dir="ltr"
              >
                {t('return.invoice_badge', { number: lookup.invoice_number })}
              </span>
            ) : null}
          </DialogTitle>
          {lookup ? (
            <p className="text-xs text-muted-foreground" dir="ltr">
              #{lookup.invoice_number} — {lookup.invoice_barcode}
            </p>
          ) : null}
        </DialogHeader>

        <div className="grid max-h-[min(32rem,calc(100dvh-10rem))] gap-3 overflow-y-auto px-6 py-4">
          <div className="space-y-1">
            <Label>{t('return.lookup')}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-0 flex-1"
                value={invoiceQuery}
                onChange={(e) => {
                  setLookupOn(false);
                  setInvoiceQuery(e.target.value);
                }}
                placeholder={t('return.scan_hint')}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 border-2 border-secondary bg-background text-secondary hover:bg-secondary/15 hover:text-secondary"
                onClick={runLookup}
                disabled={isFetching}
              >
                {t('return.search')}
              </Button>
            </div>
          </div>
          {isFetching ? <p className="text-sm text-muted-foreground">…</p> : null}
          {lookup ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('return.submit_help')}</p>
              <div className="space-y-1">
                <Label>{t('return.reason')}</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingCart || !exchangeCartId || !lookup}
                  onClick={() => {
                    autoTriedBarcodeRef.current = null;
                    void loadCartFromLookup(lookup, { force: true });
                  }}
                >
                  {t('return.reload_into_cart')}
                </Button>
                {sessionReady ? (
                  <span className="text-xs text-muted-foreground">{t('return.loaded_cart_hint')}</span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="gap-[5px] border-t border-border/80 bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => void doSubmit()}
            disabled={!lookup || !sessionReady || submit.isPending}
          >
            {t('return.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
