import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getLocalizedApiErrorMessage } from '@/api/errorMessages';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { notify } from '@/lib/toast';

import type { CartRead, ReturnLookupRead } from '../api';
import { addCartLine } from '../api';
import { cartKeys, useReturnLookup } from '../queries';

export type ReturnExchangeLineMeta = {
  productId: number;
  variantId: number;
  qtyLoaded: number;
  productName: string;
  lineGrossPerUnit: string;
};

export type ReturnExchangeSession = {
  invoiceBarcode: string;
  invoiceNumber: string;
  loads: Record<number, ReturnExchangeLineMeta>;
};

export type ReturnDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exchangeCartId?: number | null;
  exchangeSession: ReturnExchangeSession | null;
  onExchangeSessionChange: (session: ReturnExchangeSession | null) => void;
};

export function ReturnDrawer({
  open,
  onOpenChange,
  exchangeCartId,
  exchangeSession,
  onExchangeSessionChange,
}: ReturnDrawerProps) {
  const { t, i18n } = useTranslation('pos');
  const { t: tCommon } = useTranslation('common');
  const qc = useQueryClient();
  const canReturn = usePermission('returns', 'create');
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [lookupOn, setLookupOn] = useState(false);
  const { data: lookup, isFetching, isError, error: lookupError } = useReturnLookup(
    invoiceQuery.trim() || null,
    lookupOn,
  );

  const [loadingCart, setLoadingCart] = useState(false);
  const openedRef = useRef(false);
  const autoTriedBarcodeRef = useRef<string | null>(null);

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
            productName: el.product_name ?? '',
            lineGrossPerUnit:
              (el as { line_gross_per_unit?: string }).line_gross_per_unit ?? '0',
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

  if (!canReturn) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-hidden border-border bg-card p-0 sm:max-w-lg"
        dir={i18n.dir()}
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
            <>
              <p className="text-xs text-muted-foreground" dir="ltr">
                #{lookup.invoice_number} — {lookup.invoice_barcode}
              </p>
              <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                <p>{t('return.totals_help')}</p>
                <p>{t('return.totals_followup')}</p>
              </div>
            </>
          ) : null}
        </DialogHeader>

        <div className="grid max-h-[min(32rem,calc(100dvh-10rem))] gap-3 overflow-y-auto px-6 py-4 pb-6">
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
          {isError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive"
            >
              {getLocalizedApiErrorMessage(lookupError, tCommon)}
            </div>
          ) : null}
          {lookup ? (
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
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
